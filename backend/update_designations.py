import sqlite3

# List of users and their correct designations
updates = [
    ("laksanna@gmail.com", "Medical Technician"),
    ("janani@gmail.com", "Medical Technician"),
    ("aarohi@gmail.com", "Doctor"),
    ("rakshana@gmail.com", "Doctor"),
    ("nurse1@gmail.com", "Nurse"),
    ("nurse2@gmail.com", "Nurse"),
]

db_path = "database.db"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Update each user's designation
for email, designation in updates:
    cursor.execute(
        "UPDATE users SET designation = ? WHERE email = ?",
        (designation, email)
    )

conn.commit()

# Print all users and their designations for verification
print("Updated users and their designations:")
cursor.execute("SELECT name, email, designation FROM users")
for row in cursor.fetchall():
    print(f"Name: {row[0]}, Email: {row[1]}, Designation: {row[2]}")

conn.close()
print("Done.")