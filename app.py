import os, json, hashlib
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory
import pandas as pd
import numpy as np
import sqlite3
import logging
import re

APP_VERSION = "v1.0.9-hotfix"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "budget_sniffer.db")
RULES_PATH = os.path.join(BASE_DIR, "rules.json")
LOGS_DIR = os.path.join(BASE_DIR, "logs")
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(LOGS_DIR, exist_ok=True)

logging.basicConfig(
    filename=os.path.join(LOGS_DIR, "app.log"),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

def _skip_transfers_df(df):
    try:
        if "category" in df.columns:
            skipped = int((df["category"]=="Transfer").sum())
            df = df[df["category"]!="Transfer"].copy()
            return df, skipped
    except Exception:
        pass
    return df, 0


@app.after_request
def add_no_store(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

def get_db():
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as con:
        # Check if transactions table exists
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
        table_exists = cur.fetchone() is not None
        
        if not table_exists:
            # Create table from schema if it doesn't exist
            schema_path = os.path.join(BASE_DIR, "schema.sql")
            with open(schema_path, "r") as f:
                con.executescript(f.read())
            logger.info("Created transactions table from schema")
        else:
            # Table exists, check if hidden column exists
            cur.execute("PRAGMA table_info(transactions)")
            columns = [row[1] for row in cur.fetchall()]
            if 'hidden' not in columns:
                try:
                    cur.execute("ALTER TABLE transactions ADD COLUMN hidden INTEGER DEFAULT 0")
                    con.commit()
                    logger.info("Added hidden column to transactions table")
                except sqlite3.OperationalError as e:
                    logger.warning("Could not add hidden column: %s", e)
            else:
                logger.info("Hidden column already exists")
            
    logger.info("DB initialised / verified.")

@app.before_request
def _ensure_db_once():
    if not app.config.get("_DB_INIT_DONE"):
        try:
            init_db()
        finally:
            app.config["_DB_INIT_DONE"] = True

def load_rules():
    try:
        with open(RULES_PATH, "r") as fh:
            rules = json.load(fh)
        return rules
    except Exception as e:
        logger.exception("Failed to load rules: %s", e)
        return {"version": "unknown", "default_category": "Uncategorised", "rules": []}

RULES = load_rules()

def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8", "ignore")).hexdigest()

def normalise_description(s: str) -> str:
    if not isinstance(s, str): return ""
    return re.sub(r"\s+", " ", s.strip().lower())

def categorise(desc: str, amount: float) -> str:
    d = normalise_description(desc)
    for rule in RULES.get("rules", []):
        match = rule.get("match", {})
        contains_any = match.get("contains_any", [])
        regex_any = match.get("regex_any", [])
        if any(c in d for c in contains_any):
            return rule.get("category", RULES.get("default_category","Uncategorised"))
        for pat in regex_any:
            try:
                if re.search(pat, d):
                    return rule.get("category", RULES.get("default_category","Uncategorised"))
            except re.error:
                continue
    if amount > 0: return "Income"
    return RULES.get("default_category","Uncategorised")

def apply_rules_to_db():
    """
    Apply all rules from RULES to the database.
    Phase 1: Fast SQL LIKE updates for contains_any rules
    Phase 2: Regex rules (slower, row-by-row)
    Returns total number of rows updated.
    """
    total_updated = 0
    
    with get_db() as con:
        cur = con.cursor()
        
        # Phase 1: Fast SQL LIKE updates for contains_any rules
        for rule in RULES.get("rules", []):
            category = rule.get("category", RULES.get("default_category", "Uncategorised"))
            match = rule.get("match", {})
            contains_any = match.get("contains_any", [])
            
            for phrase in contains_any:
                if not phrase.strip():
                    continue
                    
                # Use LIKE for case-insensitive substring matching
                like_pattern = f"%{phrase.lower()}%"
                cur.execute("""
                    UPDATE transactions 
                    SET category = ? 
                    WHERE lower(description) LIKE ? 
                    AND category != ?
                """, (category, like_pattern, category))
                
                updated = cur.rowcount or 0
                total_updated += updated
                if updated > 0:
                    logger.info(f"Rule '{phrase}' -> '{category}': updated {updated} transactions")
        
        con.commit()
        
        # Phase 2: Regex rules (slower, iterate through transactions)
        regex_rules = [rule for rule in RULES.get("rules", []) 
                      if rule.get("match", {}).get("regex_any")]
        
        if regex_rules:
            # Get all transactions for regex processing
            cur.execute("SELECT id, description FROM transactions")
            transactions = cur.fetchall()
            
            for tx_id, description in transactions:
                normalized_desc = normalise_description(description)
                
                for rule in regex_rules:
                    category = rule.get("category", RULES.get("default_category", "Uncategorised"))
                    regex_patterns = rule.get("match", {}).get("regex_any", [])
                    
                    for pattern in regex_patterns:
                        try:
                            if re.search(pattern, normalized_desc):
                                cur.execute("""
                                    UPDATE transactions 
                                    SET category = ? 
                                    WHERE id = ? AND category != ?
                                """, (category, tx_id, category))
                                
                                if cur.rowcount > 0:
                                    total_updated += 1
                                break  # First matching rule wins
                        except re.error as e:
                            logger.warning(f"Invalid regex pattern '{pattern}': {e}")
                            continue
            
            con.commit()
    
    logger.info(f"apply_rules_to_db completed: {total_updated} total updates")
    return total_updated

def save_rules():
    """Save the current RULES dict back to rules.json"""
    try:
        with open(RULES_PATH, "w") as fh:
            json.dump(RULES, fh, indent=2, ensure_ascii=False)
        logger.info("Saved updated rules to rules.json")
    except Exception as e:
        logger.exception(f"Failed to save rules: {e}")
        raise

def extract_learning_phrase(description):
    """
    Extract a meaningful phrase from description for learning.
    Simple approach: take first significant word or first few words.
    """
    if not description:
        return None
    
    # Normalize and clean
    cleaned = normalise_description(description)
    words = cleaned.split()
    
    if not words:
        return None
    
    # Skip very common/short words
    skip_words = {'the', 'and', 'or', 'at', 'in', 'on', 'to', 'for', 'of', 'with', 'by'}
    
    # Try to find a meaningful word (longer than 2 chars, not in skip list)
    for word in words:
        if len(word) > 2 and word not in skip_words:
            return word
    
    # Fallback: return first word if nothing better found
    return words[0] if words else None

def parse_dataframe(df: pd.DataFrame, source_file: str, account_hint: str = None) -> pd.DataFrame:
    cols = {c.lower().strip(): c for c in df.columns}
    date_col = next((cols[k] for k in cols if k in ["date","transaction date","tx date","posting date"]), None)
    desc_col = next((cols[k] for k in cols if k in ["description","details","narrative","merchant","payee"]), None)
    amt_col  = next((cols[k] for k in cols if k in ["amount","amt","value"]), None)

    if amt_col is None:
        debit_col = next((cols[k] for k in cols if k in ["debit","withdrawal","debits"]), None)
        credit_col = next((cols[k] for k in cols if k in ["credit","deposit","credits"]), None)
        if debit_col and credit_col:
            df["__amount"] = pd.to_numeric(df.get(credit_col, 0), errors="coerce").fillna(0) - pd.to_numeric(df.get(debit_col, 0), errors="coerce").fillna(0)
            amt_col = "__amount"

    if date_col is None or desc_col is None or amt_col is None:
        raise ValueError("Could not infer columns (need Date, Description, Amount or Debit+Credit).")

    out = pd.DataFrame({
        "tx_date": pd.to_datetime(df[date_col], errors="coerce").dt.date.astype("string"),
        "description": df[desc_col].astype(str).fillna(""),
        "amount": pd.to_numeric(df[amt_col], errors="coerce"),
        "account": account_hint or ""
    })
    out["source_file"] = os.path.basename(source_file)
    out = out.dropna(subset=["tx_date","amount"])
    out["hash"] = out.apply(lambda r: sha1(f"{r['tx_date']}|{r['amount']}|{normalise_description(r['description'])}|{r['account']}"), axis=1)
    out["category"] = out.apply(lambda r: categorise(r["description"], r["amount"]), axis=1)
    raw_subset = df[df.columns[:40]].astype(object).where(pd.notnull(df), None).to_dict(orient="records")
    out["raw_json"] = raw_subset[:len(out)]
    return out[["tx_date","description","amount","account","category","source_file","raw_json","hash"]]

def insert_transactions(df: pd.DataFrame):
    if df.empty: return 0
    tuples = [(
        str(r.tx_date), r.description, float(r.amount), r.account, r.category, r.source_file, json.dumps(r.raw_json), r.hash, 0
    ) for r in df.itertuples(index=False)]
    with get_db() as con:
        cur = con.cursor()
        inserted = 0
        for t in tuples:
            try:
                cur.execute("""
                    INSERT INTO transactions (tx_date, description, amount, account, category, source_file, raw_json, hash, hidden)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, t)
                inserted += 1
            except sqlite3.IntegrityError:
                continue
        con.commit()
    return inserted

@app.get("/health")
def health():
    return {"ok": True, "version": APP_VERSION}

@app.get("/")
def index():
    return render_template("index.html", app_version=APP_VERSION)

@app.post("/upload")
def upload():
    if "files" not in request.files:
        return jsonify({"error":"No files part"}), 400
    files = request.files.getlist("files")
    total_inserted = 0
    total_skipped = 0
    for f in files:
        filename = f.filename or "upload"
        try:
            if filename.lower().endswith(".csv"):
                df = pd.read_csv(f)
            elif filename.lower().endswith((".xls",".xlsx")):
                df = pd.read_excel(f)
            else:
                df = pd.read_csv(f)
    
            parsed = parse_dataframe(df, filename, account_hint=None)
    
            # NEW: drop transfers
            parsed, skipped_now = _skip_transfers_df(parsed)
            total_skipped += int(skipped_now)
    
            # Save using existing helper (supports various codebases)
            inserted_now = 0
            if "insert_transactions" in globals():
                res = insert_transactions(parsed)
                inserted_now = res[0] if isinstance(res, tuple) else int(res)
            elif "save_dataframe" in globals():
                inserted_now = int(save_dataframe(parsed))
            else:
                # fallback generic insert
                con = get_db()
                cur = con.cursor()
                for r in parsed.to_dict(orient="records"):
                    cur.execute("INSERT OR IGNORE INTO transactions (tx_date, description, amount, account, category, source_file) VALUES (?, ?, ?, ?, ?, ?)",
                                (r.get("tx_date"), r.get("description"), float(r.get("amount",0) or 0), r.get("account"), r.get("category"), r.get("source_file")))
                inserted_now = cur.rowcount or 0
                con.commit()
                con.close()
    
            total_inserted += int(inserted_now)
            logger.info("Processed %s; inserted=%s skipped_transfers=%s", filename, inserted_now, skipped_now)
        except Exception as e:
            logger.exception("Failed to process %s", filename)
            return jsonify({"error": f"Failed to process {filename}: {e}"}), 400
    
    return jsonify({"status":"ok","inserted": total_inserted, "skipped_transfers": total_skipped})
    

def parse_date(s, default=None):
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return default

def default_range():
  # default to last 12 months
    today = datetime.utcnow().date()
    start = (today - timedelta(days=365))
    return start, today

EXCLUDE_FOR_ANALYTICS = {"Income", "Transfer"}

@app.get("/api/summary")
def api_summary():
    start_str = request.args.get("start")
    end_str = request.args.get("end")
    start, end = default_range()
    if start_str: start = parse_date(start_str, start)
    if end_str: end = parse_date(end_str, end)
    with get_db() as con:
        df_all = pd.read_sql_query("""
            SELECT tx_date, description, amount, account, category, hash, hidden FROM transactions
            WHERE date(tx_date) BETWEEN date(?) AND date(?)
        """, con, params=(str(start), str(end)))
    if df_all.empty:
        return jsonify({"categories": [], "weekly": {}, "hist": [], "transactions": [], "meta": {"start": str(start), "end": str(end)}})

    # Transactions for table (include everything)
    df_all["tx_date"] = pd.to_datetime(df_all["tx_date"])
    df_sorted = df_all.sort_values("tx_date", ascending=False).head(500)
    transactions = df_sorted.to_dict(orient="records")

    # Analytics should ignore Income & Transfer and hidden transactions
    df = df_all[(~df_all["category"].isin(EXCLUDE_FOR_ANALYTICS)) & (df_all["hidden"] == 0)].copy()

    if df.empty:
        cat_list = []
        weekly_points = []
        hist = []
        categories = sorted([c for c in df_all["category"].dropna().unique()])
        return jsonify({
            "categories_breakdown": cat_list,
            "weekly": {"points": weekly_points, "stats": {"avg": 0.0, "min": 0.0, "max": 0.0, "mode_nearest_thousand": 0.0}},
            "hist": hist,
            "transactions": transactions,
            "filters": {"categories": categories},
            "meta": {"start": str(start), "end": str(end), "app_version": APP_VERSION}
        })

    cat = df.groupby("category")["amount"].sum().sort_values(ascending=False).reset_index()
    cat_list = [{"category": c, "amount": float(a)} for c, a in zip(cat["category"], cat["amount"])]

    df["week"] = df["tx_date"].dt.to_period("W").apply(lambda r: r.start_time.date())
    weekly = df.groupby("week")["amount"].sum().reset_index()
    spend_series = weekly["amount"].apply(lambda x: -x if x < 0 else 0.0)
    if spend_series.empty:
        avg = mn = mx = mode = 0.0
    else:
        avg = float(spend_series.mean())
        mn = float(spend_series.min())
        mx = float(spend_series.max())
        mode_val = spend_series.iloc[(spend_series - spend_series.mean()).abs().argsort()[:1]].values[0]
        mode = float(int((mode_val + 500) // 1000) * 1000)

    weekly_points = [{"week": str(w), "amount": float(a)} for w, a in zip(weekly["week"], weekly["amount"])]

    if spend_series.empty:
        hist = []
    else:
        hist_counts, bin_edges = np.histogram(spend_series, bins=np.arange(0, max(250.0, spend_series.max()+250), 250.0))
        hist = [{"bin_from": float(bin_edges[i]), "bin_to": float(bin_edges[i+1]), "count": int(hist_counts[i])} for i in range(len(hist_counts))]

    categories = sorted([c for c in df_all["category"].dropna().unique()])

    return jsonify({
        "categories_breakdown": cat_list,
        "weekly": {
            "points": weekly_points,
            "stats": {"avg": avg, "min": mn, "max": mx, "mode_nearest_thousand": mode}
        },
        "hist": hist,
        "transactions": transactions,
        "filters": {"categories": categories},
        "meta": {"start": str(start), "end": str(end), "app_version": APP_VERSION}
    })

@app.get("/api/transactions")
def api_transactions():
    start_str = request.args.get("start")
    end_str = request.args.get("end")
    category = request.args.get("category")
    show_hidden = request.args.get("show_hidden", "false").lower() == "true"
    start, end = default_range()
    if start_str: start = parse_date(start_str, start)
    if end_str: end = parse_date(end_str, end)
    q = """
        SELECT tx_date, description, amount, account, category, hash, hidden
        FROM transactions
        WHERE date(tx_date) BETWEEN date(?) AND date(?)
    """
    params = [str(start), str(end)]
    if category:
        q += " AND category = ?"
        params.append(category)
    if not show_hidden:
        q += " AND hidden = 0"
    q += " ORDER BY date(tx_date) DESC LIMIT 500"
    with get_db() as con:
        df = pd.read_sql_query(q, con, params=params)
    return jsonify(df.to_dict(orient="records"))

@app.get("/api/categories")
def api_categories():
    base = ["Groceries","Utilities","Transport","Dining","Housing","Entertainment","Healthcare","Insurance","Education","Fees","Gifts","Travel","Savings","Transfer","Income","Uncategorised"]
    with get_db() as con:
        cur = con.cursor()
        cur.execute("SELECT DISTINCT category FROM transactions")
        rows = [r[0] for r in cur.fetchall() if r[0]]
    all_cats = sorted(set(base) | set(rows))
    return jsonify(all_cats)

@app.post("/api/update_category")
def api_update_category():
    try:
        data = request.get_json(force=True)
        h = data.get("hash")
        new_category = data.get("category")
        
        if not h or not new_category:
            return jsonify({"error": "hash and category are required"}), 400
        
        # First, update the specific transaction
        with get_db() as con:
            cur = con.cursor()
            # Get the transaction details before updating
            cur.execute("SELECT description FROM transactions WHERE hash = ?", (h,))
            result = cur.fetchone()
            if not result:
                return jsonify({"error": "Transaction not found"}), 404
            
            description = result[0]
            
            # Update the transaction
            cur.execute("UPDATE transactions SET category = ? WHERE hash = ?", (new_category, h))
            con.commit()
            
            if cur.rowcount == 0:
                return jsonify({"error": "Transaction not found"}), 404
        
        # Learn from this categorization
        learned_phrase = extract_learning_phrase(description)
        affected_like = 0
        
        if learned_phrase:
            # Check if we already have a rule for this phrase -> category
            existing_rule = None
            for rule in RULES.get("rules", []):
                if (rule.get("category") == new_category and 
                    learned_phrase in rule.get("match", {}).get("contains_any", [])):
                    existing_rule = rule
                    break
            
            if not existing_rule:
                # Add new rule
                new_rule = {
                    "name": f"User: {learned_phrase} -> {new_category}",
                    "match": {
                        "contains_any": [learned_phrase]
                    },
                    "category": new_category
                }
                RULES.setdefault("rules", []).append(new_rule)
                
                # Save updated rules
                save_rules()
                logger.info(f"Learned new rule: '{learned_phrase}' -> '{new_category}'")
                
                # Quick application of the new learned phrase
                with get_db() as con:
                    cur = con.cursor()
                    like_pattern = f"%{learned_phrase.lower()}%"
                    cur.execute("""
                        UPDATE transactions 
                        SET category = ? 
                        WHERE lower(description) LIKE ? AND category != ?
                    """, (new_category, like_pattern, new_category))
                    affected_like = cur.rowcount or 0
                    con.commit()
        
        # Apply all rules to ensure complete consistency
        relabelled_total = apply_rules_to_db()
        
        return jsonify({
            "status": "ok",
            "hash": h,
            "category": new_category,
            "learned_phrase": learned_phrase,
            "affected_like": affected_like,
            "relabelled_total": relabelled_total
        })
        
    except Exception as e:
        logger.exception("update_category failed: %s", e)
        return jsonify({"error": str(e)}), 500

@app.post("/api/reload_rules")
def api_reload_rules():
    """Reload rules from file and apply to database"""
    try:
        global RULES
        RULES = load_rules()
        logger.info("Reloaded rules from file")
        
        # Apply all rules to database
        relabelled = apply_rules_to_db()
        
        return jsonify({
            "status": "ok",
            "relabelled": relabelled,
            "version": RULES.get("version", "unknown")
        })
    except Exception as e:
        logger.exception("reload_rules failed: %s", e)
        return jsonify({"error": str(e)}), 500

@app.get("/api/rules")
def api_rules():
    """Debug endpoint to see current rules in memory"""
    return jsonify(RULES)

@app.post("/api/toggle_hidden")
def api_toggle_hidden():
    try:
        data = request.get_json(force=True)
        h = data.get("hash")
        if not h:
            return jsonify({"error":"hash is required"}), 400
        with get_db() as con:
            cur = con.cursor()
            cur.execute("UPDATE transactions SET hidden = NOT hidden WHERE hash = ?", (h,))
            con.commit()
            if cur.rowcount == 0:
                return jsonify({"error":"Transaction not found"}), 404
            # Get the new hidden status
            cur.execute("SELECT hidden FROM transactions WHERE hash = ?", (h,))
            hidden = cur.fetchone()[0]
        return jsonify({"status":"ok","hash":h,"hidden":bool(hidden)})
    except Exception as e:
        logger.exception("toggle_hidden failed: %s", e)
        return jsonify({"error": str(e)}), 500

@app.post("/api/bulk_hide_transfers")
def api_bulk_hide_transfers():
    try:
        data = request.get_json(force=True)
        action = data.get("action")  # "hide" or "unhide"
        if action not in ["hide", "unhide"]:
            return jsonify({"error":"action must be 'hide' or 'unhide'"}), 400
        
        hidden_value = 1 if action == "hide" else 0
        with get_db() as con:
            cur = con.cursor()
            cur.execute("UPDATE transactions SET hidden = ? WHERE category = 'Transfer'", (hidden_value,))
            con.commit()
            affected = cur.rowcount
        return jsonify({"status":"ok","action":action,"affected":affected})
    except Exception as e:
        logger.exception("bulk_hide_transfers failed: %s", e)
        return jsonify({"error": str(e)}), 500

@app.get("/logs/<path:filename>")
def logs_file(filename):
    return send_from_directory(LOGS_DIR, filename, as_attachment=True)

@app.post("/dev/seed")
def dev_seed():
    try:
        sample = os.path.join(DATA_DIR, "sample.csv")
        df = pd.read_csv(sample)
        parsed = parse_dataframe(df, "sample.csv", account_hint="Demo")
        count = insert_transactions(parsed)
        return {"status":"ok","inserted": count}
    except Exception as e:
        logger.exception("Seed failed: %s", e)
        return {"error": str(e)}, 500

@app.post("/api/purge_transfers")
def api_purge_transfers():
    con = get_db()
    cur = con.cursor()
    cur.execute("DELETE FROM transactions WHERE category='Transfer'")
    deleted = cur.rowcount or 0
    con.commit()
    con.close()
    return jsonify({"status":"ok","deleted": deleted})

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "5056"))
    host = os.environ.get("HOST", "127.0.0.1")
    app.run(host=host, port=port, debug=True)
