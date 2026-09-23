import csv
from pathlib import Path

CSV_FILE = "Exercise2.csv"  # must be in the same folder as this script


def read_habits(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        # Detect whether the file uses commas, semicolons or tabs
        sample = f.read(2048)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel  # fall back to commas

        reader = csv.DictReader(f, dialect=dialect)
        reader.fieldnames = [name.strip() for name in reader.fieldnames]

        if "Streak" not in reader.fieldnames:
            raise ValueError(f"No 'Streak' column found. Columns seen: {reader.fieldnames}")

        habits = []
        for row in reader:
            if not any(row.values()):
                continue  # skip empty lines
            habit = {key: (value or "").strip() for key, value in row.items()}
            habit["Streak"] = int(habit["Streak"])
            habits.append(habit)

    return habits


if __name__ == "__main__":
    csv_path = Path(__file__).parent / CSV_FILE
    habits = read_habits(csv_path)

    habits = read_habits(csv_path)

    print(f"Loaded {len(habits)} habits:\n")
    for h in habits:
        print(f"{h['User']:<8} {h['Habit']:<25} {h['Category']:<12} streak: {h['Streak']}")
        print("nTotal streak days: ", sum(h["Streak"] for h in habits))



