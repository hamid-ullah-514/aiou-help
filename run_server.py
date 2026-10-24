import sys
import uvicorn
from pathlib import Path

from aiou_app.config import HOST, PORT, DB_PATH
from aiou_app.indexer import index_all_books, get_indexing_stats

def main():
    print("=" * 65)
    print("   AIOU Help — AI-Powered Book-Based Study Assistant")
    print("   BS Islamic Studies 2.5-Year Program (AIOU)")
    print("=" * 65)

    # Ensure database is indexed
    stats = get_indexing_stats()
    if not stats.get("indexed"):
        print("\n[*] Initializing and indexing all 27 course books...")
        res = index_all_books(force=False)
        print(f"[+] Indexed {res['total_books']} books in {res['elapsed_seconds']}s")
    else:
        print(f"[*] Search index active: {stats['documents_count']} books | {stats['pages_count']} pages | {stats['passages_count']} passages")

    print("\n" + "=" * 65)
    print(f"   🚀 Server running at: http://{HOST}:{PORT}")
    print(f"   📖 Open your browser and navigate to: http://{HOST}:{PORT}")
    print("=" * 65 + "\n")

    uvicorn.run("aiou_app.server:app", host=HOST, port=PORT, log_level="info")

if __name__ == "__main__":
    main()
