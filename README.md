# Rakuten Travel MCP

楽天トラベルの公開 API 全7種類を使える、ローカル実行用の MCP Server です。Node.js 22 以降で動作し、stdio で MCP クライアントと接続します。

施設・空室・宿泊プランの検索、施設詳細、地区コード、ホテルチェーン、ランキングを扱います。API が返す項目は削らず、元の JSON とリンクを返します。

## 起動

```sh
npm ci
npm run build
cp .env.example .env
```

`.env` を編集します。すでに設定済みの場合は上書きしないでください。

```dotenv
RAKUTEN_APPLICATION_ID=your_application_id
RAKUTEN_ACCESS_KEY=your_access_key
RAKUTEN_AFFILIATE_ID=your_affiliate_id
RAKUTEN_REFERER=https://your-registered-site.example/
```

`RAKUTEN_REFERER` には、楽天のアプリ設定の「許可されたWebサイト」に登録した URL を指定します。サーバーはこの URL を Referer に、その origin を Origin ヘッダーに設定します。今回の認証確認では Referer だけでは拒否され、Origin を付けると成功しました。

```sh
npm start
```

通常起動では標準出力にログを出しません。標準入出力を MCP 通信専用にするため、ターミナルで起動すると入力待ちになります。

## MCP クライアントへの設定

次の JSON のパスを実際の場所に置き換え、クライアントの MCP サーバー設定に追加します。`command` には Node.js の実行ファイルの絶対パスも指定できます。

```json
{
  "mcpServers": {
    "rakuten-travel": {
      "command": "node",
      "args": ["/absolute/path/rakuten-travel-mcp/dist/index.js"]
    }
  }
}
```

プロジェクト直下の `.env` は、クライアントの作業ディレクトリにかかわらず読み込みます。別のファイルを使う場合は `args` に `"--env-file", "/absolute/path/to/.env"` を追加してください。`RAKUTEN_ENV_FILE` でも指定できます。環境変数にすでに値がある場合は、その値を優先します。

認証情報を `.env` に置かず、クライアント設定の `env` で渡す方法も使えます。実際の認証情報を含む設定や `.env` は Git に追加しないでください。

## ツール

| MCP ツール | 用途 | API バージョン |
| --- | --- | --- |
| `search_hotels` | 施設番号・地区・座標から施設検索 | SimpleHotelSearch / 20260731 |
| `get_hotel_details` | 設備・評価・宿泊条件・キャンセルポリシーなど | HotelDetailSearch / 20260731 |
| `search_vacant_hotels` | 日程・人数・料金・食事条件から空室とプラン検索 | VacantHotelSearch / 20170426 |
| `get_area_class` | 地区コードの全階層 | GetAreaClass / 20140210 |
| `search_hotels_by_keyword` | キーワード必須の検索、都道府県・チェーンで絞り込み | KeywordHotelSearch / 20260731 |
| `get_hotel_chains` | チェーンコードと名称 | GetHotelChainList / 20131024 |
| `get_hotel_rankings` | 総合・温泉宿・高級ホテル／旅館のランキング | HotelRanking / 20170426 |
| `find_area_codes` | 地名から検索に使える地区コード一式を取得 | GetAreaClass を使う補助ツール |

各 API のサービス固有パラメーターをすべて公開しています。認証情報はサーバー設定で管理し、レスポンス形式は JSON に固定します。XML、JSONP、`callback` は公開しません。共有パラメーターの `affiliateId`、`elements`、`formatVersion` は各ツールで指定できます。

詳細な入力スキーマと公式仕様へのリンクは、MCP Resource `rakuten-travel://reference/apis` から取得できます。検索の流れは `rakuten-travel://guide` にあります。

## 検索例

地区コードは推測せず、先に地名で調べます。

```json
{"query":"新宿","leafOnly":true,"limit":10}
```

`find_area_codes` の結果には祖先のコードも含まれます。地区から施設や空室を検索するときは、末端までのコード一式を渡します。`offset` と `limit` で地区コード検索をページ送りできます。

施設名から探す場合は `search_hotels_by_keyword` を使います。

```json
{"keyword":"京都 温泉","hits":10,"responseType":"large","sort":"+roomCharge"}
```

施設詳細を取得するときは、検索結果の `hotelNo` を `get_hotel_details` に渡します。`responseType: "large"` で、API が提供する詳細情報をすべて取得できます。

東京駅付近の空室・プランを探す `search_vacant_hotels` の例です。日付は希望日に置き換えてください。

```json
{
  "latitude":35.6812,
  "longitude":139.7671,
  "searchRadius":3,
  "checkinDate":"2026-11-01",
  "checkoutDate":"2026-11-02",
  "adultNum":2,
  "roomNum":1,
  "maxCharge":30000,
  "squeezeCondition":["kinen","breakfast"],
  "searchPattern":1,
  "responseType":"large",
  "sort":"+roomCharge",
  "hits":10
}
```

空室検索は、小学生高学年・低学年、幼児の食事／布団の有無を分けて人数を指定できます。人数は1室あたりです。`searchPattern: 0` は施設単位で施設ごとのプランは最大3件、`1` はプラン・客室単位で検索します。チェックイン・アウトは両方を指定するか、両方を省略します。省略時は API の当日／翌日指定になります。

チェーン検索では、`get_hotel_chains` のコードを、必須の `keyword` とともに `search_hotels_by_keyword` の `hotelChainCode` に渡します。ランキングは `get_hotel_rankings` に `{"genre":["all","onsen","premium"]}` を渡すと3ジャンルを取得できます。

## 入出力の扱い

- 座標は既定で WGS84 の度（`datumType: 1`）。日本測地系の秒を使う場合は `2` を明示します。
- JSON 構造は既定で `formatVersion: 2`。元の API の既定値は両方とも異なるため、この2項目は明示的に送信します。
- 施設番号は最大15件、チェーンコードは最大5件。CSV と配列の両方に対応します。単一の施設番号は数値でも指定できます。
- `page` は1〜100、`hits` は1〜30。`pagingInfo` を見て次ページを明示的に取得します。自動で全ページを読み込むことはありません。
- `elements` で返却フィールドを絞れます。指定しなければ API の返却項目をそのまま保持します。
- 座標と施設番号と地区コードを併記した場合は、楽天の仕様どおり「施設番号 → 座標 → 地区コード」の順に優先します。
- 地区コードの祖先指定漏れはローカルで検証し、実際の階層で末端まで指定できているかは API が検証します。
- アフィリエイト ID は環境変数の値を使用し、ツール引数の `affiliateId` で上書きできます。楽天が返すリンクをそのまま返します。
- エラーは `isError: true` と、コード・メッセージ・HTTP ステータスで返します。`Retry-After` があれば併せて返します。自動再試行は行いません。
- API へのリクエストは順番に実行し、開始間隔は既定で1秒です。この値は本実装の初期設定で、楽天の利用枠を保証するものではありません。永続キャッシュはありません。

施設検索の最安料金は目安です。空室検索の `dailyCharge` は1泊目の料金で、`chargeFlag` が0なら1人あたり、1なら1室あたりの `rakutenCharge` です。`total` もその1泊の合計で、連泊全体の合計ではありません。廃止済みの `lowestCharge` / `highestCharge` は固定値0なので料金判定に使わないでください。

実際の宿泊料金・空室は日程、人数、客室、プランに依存します。予約は返却された楽天トラベルのリンク先で行います。公開されている7 API には予約確定・決済・取消の機能はありません。

## 設定項目

| 環境変数 | 内容 | 既定値 |
| --- | --- | --- |
| `RAKUTEN_APPLICATION_ID` | アプリ ID、必須 | なし |
| `RAKUTEN_ACCESS_KEY` | Access key、必須。ヘッダーで送信 | なし |
| `RAKUTEN_AFFILIATE_ID` | アフィリエイト ID | なし |
| `RAKUTEN_REFERER` | 許可された登録サイト URL。Referer・Origin に使用 | なし |
| `RAKUTEN_TIMEOUT_MS` | 1回の HTTP 通信のタイムアウト | 15000 |
| `RAKUTEN_MIN_INTERVAL_MS` | リクエスト開始の最小間隔 | 1000 |
| `RAKUTEN_ENV_FILE` | 読み込む設定ファイルのパス | プロジェクト直下の `.env` |

## 開発・検証

```sh
npm run check
npm run check:spec
npm run test:live
```

`check` は型検査、通信をモックしたテスト、ビルドを実行します。`check:spec` は公式サイトの入力表を取得し、各 API の入力項目名とバージョンをコードと比較します。表の記載内容や必須条件まで自動判定するものではありません。公式サイトの HTML 変更で失敗した場合も確認が必要です。

`test:live` はビルド済みのサーバーを MCP クライアントから起動し、全8ツールと2つの Resource を確認します。設定済みの認証情報を使って楽天にアクセスし、実データ検証時の開始間隔は2秒に設定します。空室テストは日本時間の実行日の7日後を使うため、空室がなくなれば失敗する場合があります。429 が返った場合は `Retry-After` を確認してから再実行してください。結果は実行時点の確認です。

検証結果と依存 SDK の既知の制約は [docs/verification.md](docs/verification.md) に記録します。

## 公式資料

- [楽天トラベル API 一覧](https://webservice.rakuten.co.jp/documentation)
- [施設検索](https://webservice.rakuten.co.jp/documentation/simple-hotel-search)
- [施設情報](https://webservice.rakuten.co.jp/documentation/hotel-detail-search)
- [空室検索](https://webservice.rakuten.co.jp/documentation/vacant-hotel-search)
- [地区コード](https://webservice.rakuten.co.jp/documentation/get-area-class)
- [キーワード検索](https://webservice.rakuten.co.jp/documentation/keyword-hotel-search)
- [ホテルチェーン](https://webservice.rakuten.co.jp/documentation/get-hotel-chain-list)
- [ランキング](https://webservice.rakuten.co.jp/documentation/hotel-ranking)

データ提供：[Rakuten Web Service](https://webservice.rakuten.co.jp/)。利用画面でのクレジット表示は[公式ガイド](https://webservice.rakuten.co.jp/guide/credit)を参照してください。
