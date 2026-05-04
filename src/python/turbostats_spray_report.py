import re
import time
from urllib.parse import quote

import pandas as pd
from playwright.sync_api import sync_playwright

BASE = "https://www.turbostatsevents.com"
LEAGUE_PLAYERS_URL = "https://www.turbostatsevents.com/site/2/softball/lvc/valhalla2025/players"
SEASON_KEY = "valhalla2025"


def clean_int(value):
    if value is None:
        return 0
    m = re.search(r"-?\d+", str(value).replace(",", ""))
    return int(m.group()) if m else 0


def pct(part, total):
    return round((part / total) * 100, 1) if total else 0.0


def player_param(name):
    return quote(name.strip().replace(" ", "_"))


def team_path(team):
    return quote(team.strip(), safe="")


def get_team_names(page):
    page.goto(LEAGUE_PLAYERS_URL, wait_until="networkidle")
    links = page.locator("a").evaluate_all("""
        els => els.map(a => ({
            text: (a.innerText || '').trim(),
            href: a.href
        }))
    """)

    teams = set()
    for link in links:
        text = link["text"].strip()
        href = link["href"]
        if SEASON_KEY in href and text and text.upper() == text:
            if text not in {"HOME", "TEAMS", "SCHEDULE", "STANDINGS", "STATS", "RULES"}:
                teams.add(text)

    # Fallback from your screenshot/sidebar pattern
    if not teams:
        sample = f"{BASE}/site/2/stats/softball/lvc/valhalla2025_DARK%20SIDE?report=batting"
        page.goto(sample, wait_until="networkidle")
        body = page.inner_text("body")
        known = [
            "BEASTS OF BURDEN", "DARK SIDE", "DAZED AND CONFUSED", "DEAD & CO",
            "GRATEFUL DEAD", "PURPLE HAZE", "RIDERS ON THE STORM",
            "SHAMROCK SHROOMS", "TEAM DEAN", "TEAM DEREK", "THE ANIMALS",
            "THE TRIPPERS", "UNFORTUNATE SONS", "WHARF RATS"
        ]
        teams.update([t for t in known if t in body])

    return sorted(teams)


def get_players_for_team(page, team):
    url = f"{BASE}/site/2/stats/softball/lvc/{SEASON_KEY}_{team_path(team)}?report=batting"
    page.goto(url, wait_until="networkidle")
    time.sleep(1)

    body = page.inner_text("body")

    # On TurboStats, the batting player list appears between Opponents/Team and Year.
    match = re.search(r"Opponents\s+Team\s+(.*?)\s+Year:", body, re.S | re.I)
    if not match:
        return []

    raw = match.group(1)
    raw = re.sub(r"\s+", " ", raw).strip()

    # Split names heuristically by detecting capitalized chunks.
    # Better fallback: collect visible option/button/link text if site exposes them.
    candidates = []
    for token in re.split(r"(?=(?:[A-Z][a-z]+|SUB|Sub|sub)\s)", raw):
        token = token.strip()
        if not token:
            continue
        candidates.append(token)

    # Safer parse from select options, if present
    options = page.locator("option").evaluate_all("els => els.map(o => o.innerText.trim()).filter(Boolean)")
    if options:
        bad = {"Opponents", "Team", "BATTING", "PITCHING"}
        players = [o for o in options if o not in bad and not o.isupper()]
    else:
        # Manual cleanup for this site’s rendered text
        words = raw.split()
        players = []
        current = []
        prefixes = {"SUB", "Sub", "sub"}

        for w in words:
            if not current:
                current = [w]
            elif w in prefixes:
                players.append(" ".join(current))
                current = [w]
            elif len(current) >= 2:
                players.append(" ".join(current))
                current = [w]
            else:
                current.append(w)

        if current:
            players.append(" ".join(current))

    players = [
        p.strip()
        for p in players
        if p.strip()
        and p.strip().lower() not in {"opponents", "team"}
        and len(p.strip()) > 1
    ]

    return sorted(set(players))


def scrape_player(page, team, player):
    url = (
        f"{BASE}/site/2/stats/softball/lvc/"
        f"{SEASON_KEY}_{team_path(team)}?player={player_param(player)}&report=batting"
    )

    page.goto(url, wait_until="networkidle")
    time.sleep(1)

    table_data = page.locator("table").evaluate_all("""
        tables => tables.map(table => {
            const rows = [...table.querySelectorAll("tr")].map(tr =>
                [...tr.querySelectorAll("th,td")].map(td => td.innerText.trim())
            );
            return rows;
        })
    """)

    hits = h2l = h2c = h2r = 0

    for table in table_data:
        if not table:
            continue

        headers = [h.strip() for h in table[0]]
        if not {"Hits", "H2L", "H2C", "H2R"}.issubset(set(headers)):
            continue

        idx_hits = headers.index("Hits")
        idx_h2l = headers.index("H2L")
        idx_h2c = headers.index("H2C")
        idx_h2r = headers.index("H2R")

        for row in table[1:]:
            if len(row) <= max(idx_hits, idx_h2l, idx_h2c, idx_h2r):
                continue

            label = " ".join(row).lower()
            if "total" in label:
                # Prefer totals row if one exists
                hits = clean_int(row[idx_hits])
                h2l = clean_int(row[idx_h2l])
                h2c = clean_int(row[idx_h2c])
                h2r = clean_int(row[idx_h2r])
                break

            hits += clean_int(row[idx_hits])
            h2l += clean_int(row[idx_h2l])
            h2c += clean_int(row[idx_h2c])
            h2r += clean_int(row[idx_h2r])

    return {
        "Team": team,
        "Player": player,
        "Hits": hits,
        "H2L": h2l,
        "H2L %": pct(h2l, hits),
        "H2C": h2c,
        "H2C %": pct(h2c, hits),
        "H2R": h2r,
        "H2R %": pct(h2r, hits),
        "URL": url,
    }


def main():
    rows = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1200})

        teams = get_team_names(page)
        print(f"Found teams: {teams}")

        for team in teams:
            print(f"\nTeam: {team}")
            players = get_players_for_team(page, team)
            print(f"  Found {len(players)} players")

            for player in players:
                try:
                    row = scrape_player(page, team, player)
                    rows.append(row)
                    print(f"    {player}: Hits={row['Hits']} H2L={row['H2L']} H2C={row['H2C']} H2R={row['H2R']}")
                except Exception as e:
                    print(f"    ERROR {team} / {player}: {e}")

        browser.close()

    df = pd.DataFrame(rows)
    df = df.sort_values(["Team", "Player"])

    df.to_csv("valhalla2025_h2_report.csv", index=False)
    df.to_excel("valhalla2025_h2_report.xlsx", index=False)

    print("\nDone.")
    print("Created:")
    print("  valhalla2025_h2_report.csv")
    print("  valhalla2025_h2_report.xlsx")


if __name__ == "__main__":
    main()