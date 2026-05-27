import requests
from bs4 import BeautifulSoup
import time
import random
import csv
import re
import os

BASE_URL = "https://www.ginkoubangou.com/"

# 代表的なブラウザのUser-Agentリスト
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/114.0.1823.51",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15"
]

def get_soup(session, url, referer=None):
    # アクセス検知（403エラー）を避けるためのランダムな待機時間（1秒〜3秒）
    sleep_time = random.uniform(1.0, 3.0)
    time.sleep(sleep_time)
    print(f"Fetching: {url}")
    
    # 毎回ランダムにUser-Agentを選択
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Connection": "keep-alive"
    }
    
    # Referer（遷移元のURL）があれば追加
    if referer:
        headers["Referer"] = referer
        
    try:
        # Sessionオブジェクトを使ってアクセス（Cookieが自動的に維持される）
        response = session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        # 文字化け対策
        response.encoding = response.apparent_encoding 
        return BeautifulSoup(response.text, 'html.parser')
    except Exception as e:
        print(f"リクエストエラー ({url}): {e}")
        return None

def main():
    print("スクレイピングを開始します...")
    
    # Cookieを維持するためのSessionオブジェクトを作成
    session = requests.Session()
    
    bank_list_urls = set()
    shiten_list_urls = {}  # urlをキー、refererを値とする辞書
    
    # 1. トップ（銀行の種類）ページから、各種銀行一覧ページのURLを取得
    top_url = BASE_URL + "bank_type.php"
    soup = get_soup(session, top_url)
    if not soup:
        print("トップページの取得に失敗しました。")
        return

    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        if "bank_list.php?type_no=" in href:
            bank_list_urls.add(BASE_URL + href)
        elif "shiten_list.php?bank_code=" in href:
            # 系統中央機関などが直接トップページにある場合
            shiten_list_urls[BASE_URL + href] = top_url
            
    print(f"銀行種類ページのURLを {len(bank_list_urls)} 件取得しました。")
            
    # 2. 各銀行一覧ページ（種類ごと）から、すべての銀行の支店一覧ページのURLを取得
    for url in bank_list_urls:
        # Refererはトップページとする
        soup = get_soup(session, url, referer=top_url)
        if not soup:
            continue
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "shiten_list.php?bank_code=" in href:
                # 支店一覧ページへの遷移元（Referer）は、この銀行一覧ページとする
                shiten_list_urls[BASE_URL + href] = url
                
    print(f"対象の金融機関（支店一覧ページ）を {len(shiten_list_urls)} 件取得しました。")
            
    # ======== 出力ファイルの準備 ========
    output_file = "bank_branches.csv"
    fieldnames = ["金融機関コード", "金融機関名", "支店コード", "支店名"]
    
    # 既にファイルが存在する場合は削除（再実行時に上書きするため）
    if os.path.exists(output_file):
        os.remove(output_file)
        
    # まずヘッダーだけを書き込む
    with open(output_file, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
    # ====================================

    # 3. 各銀行の支店一覧ページから、支店情報を取得
    count = 0
    total_banks = len(shiten_list_urls)
    total_branches = 0
    
    for url, referer in shiten_list_urls.items():
        count += 1
        print(f"[{count}/{total_banks}] 処理中...")
        
        # Refererを渡してアクセス
        soup = get_soup(session, url, referer=referer)
        if not soup:
            continue
            
        # 金融機関コードをURLから取得
        match = re.search(r'bank_code=(\d+)', url)
        if not match:
            continue
        bank_code_raw = match.group(1)
        bank_code = bank_code_raw.zfill(4) # 4桁ゼロ埋め
        
        # 金融機関名を取得（タイトルから抽出）
        title = soup.find('title')
        if title:
            bank_name = title.text.split('の支店一覧')[0].strip()
        else:
            bank_name = "不明"
            
        main_div = soup.find("div", id="main")
        if not main_div:
            continue
            
        bank_results = []
        for a_tag in main_div.find_all("a", href=True):
            if "detail.php?no=" in a_tag["href"]:
                branch_name = a_tag.text.strip()
                branch_code = ""
                # 支店コードは <a> タグの直前のテキスト（例: "・001 "）から抽出
                prev_text = a_tag.previous_sibling
                if prev_text and isinstance(prev_text, str):
                    # 3桁とは限らない場合を考慮して \d+ に変更
                    b_code_match = re.search(r'(\d+)', prev_text)
                    if b_code_match:
                        branch_code = b_code_match.group(1).zfill(3)
                        
                bank_results.append({
                    "金融機関コード": bank_code,
                    "金融機関名": bank_name,
                    "支店コード": branch_code,
                    "支店名": branch_name
                })
                        
        # 支店が0件の場合でも、金融機関情報自体は保存する
        if not bank_results:
            bank_results.append({
                "金融機関コード": bank_code,
                "金融機関名": bank_name,
                "支店コード": "",
                "支店名": ""
            })
            
        # 1つの金融機関の処理が終わるたびにCSVに「追記モード」で書き込む
        with open(output_file, "a", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writerows(bank_results)
            
        # 支店がない場合は0件としてカウント、ある場合はその数をカウント
        branch_count = len(bank_results) if bank_results[0]["支店名"] != "" else 0
        total_branches += branch_count
        print(f"  -> {bank_name} ({branch_count}店舗) を保存しました。")
                        
    print(f"\nスクレイピング完了！")
    print(f"合計 {total_branches} 件のデータを {output_file} に保存しました。")

if __name__ == "__main__":
    main()
