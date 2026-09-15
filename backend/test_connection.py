"""
Quick connection test for MongoDB Atlas.
Run with: python test_connection.py
"""

import os
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "skillgap_ai")

def test_connection():
    if not MONGO_URI:
        print("❌ MONGO_URI not found. Check that your .env file exists and is in the same folder as this script.")
        return

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # The ping command is cheap and confirms a real connection, not just a client object.
        client.admin.command("ping")
        print("✅ Connected to MongoDB Atlas successfully.")

        db = client[MONGO_DB_NAME]
        print(f"📂 Using database: '{MONGO_DB_NAME}'")

        # Write a throwaway document to confirm write access and trigger DB creation.
        test_collection = db["connection_test"]
        result = test_collection.insert_one({"status": "connected", "note": "test document"})
        print(f"📝 Inserted test document with _id: {result.inserted_id}")

        # Clean up the test document so it doesn't clutter the database.
        test_collection.delete_one({"_id": result.inserted_id})
        print("🧹 Cleaned up test document.")

        print("\nAll good — your backend can read and write to Atlas.")

    except ConfigurationError as e:
        print(f"❌ Configuration error — check your MONGO_URI format: {e}")
    except ConnectionFailure as e:
        print(f"❌ Could not connect. Check your IP whitelist and credentials: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    test_connection()