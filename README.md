# Retail Flow

実店舗での商品配置の変更と、顧客の動線・行動・購買の変化を記録・比較する MVP です。
仕様の基準は [SPEC.md](./SPEC.md) です。Phase 1〜7の機能を維持し、Phase 8でログイン・店舗別データ分離・RLSを追加しています。現在の設定手順は以下の「Phase 8」です。実店舗での確認手順は [FIELD_TEST.md](./FIELD_TEST.md) を参照してください。

## 起動と確認

```sh
npm install
npm run dev
```

```sh
npm run lint
npm test
npm run build
npm run test:browser
```

スマートフォンから開発サーバーを確認する場合は、同じネットワークで
`npm run dev -- --host 0.0.0.0` を実行し、表示された Network URL を開いてください。

## Phase 1 の実装範囲

- スマホ優先のホーム画面
- 所属店舗のDB上の名前と、店舗内の最新配置バージョン
- 最も目立つ「観察を開始」ボタンと、その下の「配置を変更」ボタン
- 今日の観察人数・購入人数（Phase 4からSupabaseの実データを表示）
- 「分析を見る」「配置履歴」ボタン

「配置を変更」から店舗マップ編集画面を開けます。
「観察を開始」から確認画面を挟まず顧客観察を開始できます。
「配置履歴」は時系列の履歴画面を開き、「分析を見る」は配置前後の比較画面を開きます。
今日の人数は日本時間で開始した当日の保存済み観察を集計します。
仮の18人・4人は加算せず、破棄した観察も含めません。

## Phase 2 の実装範囲

- 上から見たシンプルな四角形の店舗マップ
- 売場ゾーン・入口・レジ・試着室の追加と削除
- ゾーン名・カテゴリー・商品名または商品グループ・メモの編集
- タッチ・マウスのドラッグで移動、緑のハンドルでサイズ変更
- 幅・高さのスライダーでサイズ変更
- 文字・商品名・アイコン・余白を実測した最小サイズまで縮小。長い文字は省略せず折り返し、名前・商品名の変更時にも収まるサイズへ調整
- キーボードの矢印キーによる移動・サイズ変更
- 空白を通路として扱い、通路オブジェクトは作成しない
- 重なった要素も一覧から選択して編集できる
- 未保存の変更を破棄して戻る際の確認

「新しい配置として保存」でホームに戻り、保存済みの最新配置を次回の編集に使います。
保存済みマップと編集用のコピーは React の state で分けています。
保存せず戻った変更は破棄されます。保存後は再読み込みしてもDBの最新配置を取得します。
Phase 8では未設定・未ログインの状態から店舗画面を開けません。設定案内またはログイン画面を表示します。
回転、3D、複雑な図形、正確な寸法は実装していません。
配置のDB保存・変更理由・履歴はPhase 5で追加しています。AIは導入していません。

## Phase 3 の実装範囲

- 開始時点の保存済みマップと配置バージョンをコピーして保持
- 観察番号（セッション内の #001 から）・開始時刻・日本時間の日付を自動記録
- マップ上のゾーンをタップした順にルートを記録（再訪は別のステップ）
- 現在のゾーンに対する「立ち止まる」「商品に触る」「値札を見る」「試着」のON/OFF
- 「1つ戻す」で直前のルート追加またはイベントのON/OFFを取り消し
- 接客開始時刻・開始ゾーンを記録し、接客中は3つの操作だけを表示
- 接客終了後の観察再開、接客中からの購入・非購入終了
- 訪問した売場の商品を優先する購入候補（その他・不明の商品も選択可能）
- 単品は候補を1回タップして終了、複数購入は候補を選び「購入で終了」
- 画面下部に固定した購入・非購入の終了ボタン
- 確認して観察を破棄し、そのデータを保持しない
- 重なったゾーンは「一覧から場所を選ぶ」から記録可能

観察中・保存前のデータは React state に保持します。Phase 4から終了した観察をSupabaseに保存します。
記録には `id`、観察番号、開始・終了時刻、日付、配置バージョンと配置のコピー、
`routeSteps`、`customerService`、`result`、`purchasedItems`、複数購入の有無を保持します。
接客を複数回行った場合は、最初の接客情報と各回の開始・終了情報を保持します。
購入の場合の終了時刻は「購入で終了」を押した時点で確定し、商品選択の時間を含めません。
商品選択から「観察に戻る」と、終了前の観察・接客状態を復元します。
配置前後の分析はPhase 6で追加しています。AIは導入していません。

## Phase 8 の認証・店舗分離（現在の設定手順）

### SQLの実行順と既存データ

新規DBでは、SQL Editorで次の各ファイルを全体実行してください。

1. [supabase/schema.sql](./supabase/schema.sql)
2. [supabase/layout-history.sql](./supabase/layout-history.sql)
3. [supabase/analysis.sql](./supabase/analysis.sql)
4. **[supabase/security.sql](./supabase/security.sql)**

Phase 6〜7の最新版まで設定済みのDBは **`security.sql` だけ**追加実行します。移行前にDBのバックアップと既存レコード件数を確認してください。SQLは1トランザクションで実行され、失敗時には変更が残りません。

既存の単店舗データは、移行用店舗 `00000000-0000-4000-8000-000000000001` に所属させます。観察ID・配置ID・番号・JSON・日時・変更理由とNULLだった履歴IDは残します。自動でユーザーを所属させないため、次の管理者登録が済むまで既存データは利用者に見えません。旧データの文字列から配置IDを推測して紐づけることもありません。

`security.sql` は再実行できます。**適用後は旧3ファイルを再実行しないでください。** 旧SQLには匿名RPC権限の復活を防ぐ停止ガードを追加しています。将来の変更は新しい移行SQLとして追加します。別DBへ既存データを複製するときも、店舗と所属を先に確認してください。

### ユーザーと店舗を管理者が登録する

1. Supabase Dashboardの **Authentication → Users** でスタッフのメールアドレス・パスワードのユーザーを作成します。メール確認が完了していることも確認してください。アプリに一般向けの新規登録・所属店舗の自己変更機能はありません。
2. SQL Editorで店舗名と所属を設定します。以下のメールアドレスと店舗名を実際のものに置き換えて実行してください。パスワード・Secret keyはSQLにも記載しません。

```sql
-- 既存の単店舗データを利用する管理者を登録する例。
begin;
update public.stores set name = '店舗A'
where id = '00000000-0000-4000-8000-000000000001';
do $$
declare staff_id uuid;
begin
  select id into staff_id from auth.users where email = 'owner@example.com';
  if staff_id is null then raise exception 'Authで先にユーザーを作成してください'; end if;
  insert into public.store_members(user_id, store_id, role)
  values (staff_id, '00000000-0000-4000-8000-000000000001', 'owner');
end $$;
commit;
```

```sql
-- 別店舗を新しく作る例。同じ店舗に追加するスタッフは既存store_idを使う。
begin;
do $$
declare new_store uuid; staff_id uuid;
begin
  select id into staff_id from auth.users where email = 'staff-b@example.com';
  if staff_id is null then raise exception 'Authで先にユーザーを作成してください'; end if;
  insert into public.stores(name) values ('店舗B') returning id into new_store;
  insert into public.store_members(user_id, store_id, role) values (staff_id, new_store, 'staff');
end $$;
commit;
```

`store_members.user_id` は主キーで、v0.1は1ユーザー1店舗です。`owner / manager / staff` を保持しますが、現段階ではいずれも自店舗の観察・配置を扱う権限です。店舗作成・所属追加／変更・役割変更はSQL Editorの管理者だけが行います。既存所属の変更は管理者が本人と移動先を確認し、明示的なUPDATEで行ってください。

### 接続設定とログイン

[.env.example](./.env.example) を `.env.local` にコピーし、公開用の設定を入力して再起動／再ビルドします。

```dotenv
VITE_SUPABASE_URL=プロジェクトURL
VITE_SUPABASE_PUBLISHABLE_KEY=Publishable key
```

既存の `VITE_SUPABASE_ANON_KEY` も互換用に利用できます。両方設定した場合はPublishable設定を優先します。公開キーをフロントで使う前提で、Auth・GRANT・RLSで権限を制限します。`sb_secret_` と `service_role` JWTは初期化時に拒否します。`.env.local` はGit管理対象外、`.env.example` の値は空欄です。ブラウザ内に管理者用のキーは不要です。[公開キーの公式説明](https://supabase.com/docs/guides/getting-started/api-keys)

メール＋パスワードでログイン → Authでユーザーを確認 → `get_current_store()` で所属確認 → 店舗画面を表示します。保存されたセッションは再読み込み後もSDKが復元・自動更新します。所属未登録や確認失敗時はログイン画面と案内を表示し、観察・配置・人数・分析のAPIを呼びません。店舗名は `stores.name` を使用します。

ホームの「ログアウト」はこの端末のセッションを終了し、店舗画面と下書きを消します。別アカウント／別店舗へ切り替える際は前の画面・集計を引き継ぎません。セッション切れによる再ログインでは、同じユーザー・同じ店舗の場合だけ未保存の観察／配置編集をメモリから復元し、同じ保存IDで再試行できます。下書きは永続保存していないため、タブを閉じる・再読み込みを実行すると失われます。

### RLS・RPCの権限

| 対象 | authenticated（所属確認済みユーザー） | anon・未ログイン |
| --- | --- | --- |
| `observations` | 自店舗のみSELECT / INSERT / UPDATE | 全操作を拒否 |
| `layout_versions` | 自店舗のみSELECT / INSERT、UPDATEは`change_note`列だけ | 全操作を拒否 |
| `stores` | 自店舗のSELECTだけ | 全操作を拒否 |
| `store_members` | 自分の所属のSELECTだけ | 全操作を拒否 |
| 7つの公開RPC | 自店舗に限定して実行 | EXECUTEを拒否 |

全4テーブルでRLSを有効化し、DELETEは許可しません。UPDATEは変更前の所属チェック（USING）と変更後の所属チェック（WITH CHECK）の両方を行い、store_idを書き換えて他店舗へ移すことも拒否します。配置の過去マップ・番号は列権限で上書きできず、アプリは理由も新バージョンに保存します。所属の自己追加・役割変更は禁止です。ユーザーが編集できる`user_metadata`から権限を決めません。[RLSの公式説明](https://supabase.com/docs/guides/database/postgres/row-level-security)

観察と配置にNOT NULLのstore_id・店舗FKを追加し、観察の `(store_id, layout_version_id)` に複合FKを設けています。配置番号の一意性・保存ロックも店舗単位です。全RPCは `SECURITY INVOKER` と固定の空search_pathを使用し、RLSを通した所属情報からstore_idを導出します。任意のstore_idをRPC引数として受け取りません。観察JSONにstore_idがあれば所属と一致するか追加検証します。

分析は選択した2配置の所有店舗を確認し、すべての観察・接客・ファネル・旧履歴IDなしの除外人数まで自店舗に限定します。他店舗のID・店舗の混在は拒否します。補助関数は非公開の `retail_private` に置きます。旧RPCの匿名EXECUTE・テーブルと列の余分な権限を取り除き、将来の関数も作成者のデフォルトでは公開EXECUTEを付与しません。

### Supabase Dashboardでの手動確認

- **Security Advisor** を再実行し、対象4テーブルのRLS無効、公開テーブル／auth.usersの露出、全許可policy、関数の可変search_path、匿名実行可能なSECURITY DEFINER関数などの指摘を確認する。プロジェクト内に別途追加したテーブル・view・RPC・拡張も確認する。[Advisorの公式説明](https://supabase.com/docs/guides/observability/advisors)
- **Database → Tables / Policies** で上表の権限とpolicyを確認する。SQL EditorやTable Editorの管理者表示はRLSを回避するため、それだけで店舗分離を判定しない。
- **API / Data API設定** の公開スキーマに `auth` や `retail_private` を含めない。想定外の関数オーバーロード・view・古い全許可policyがないか確認する。
- **Authentication** でEmail/Passwordを有効にし、運用に不要な公開signup・匿名ログインを無効にする。ユーザーのメール確認、所属行、パスワード要件、利用可能なら漏えいパスワード保護、レート制限を確認する。[パスワード保護の公式説明](https://supabase.com/docs/guides/auth/password-security)
- **API Keys** で配信ビルドがPublishable keyのみを使うことを確認する。以前Secret／service_roleを公開した履歴があれば、Dashboardで失効・再発行する。
- AuthのSite URL・許可するリダイレクトURLとHTTPSの配信先を確認する。共有端末では利用終了時にログアウトする。Supabaseの仕様上、ログアウトでリフレッシュトークンは失効しても発行済みJWTは有効期限まで残るため、JWT有効期間も運用に合わせて確認する。[signOutの公式説明](https://supabase.com/docs/reference/javascript/auth-signout)
- テスト用の店舗A／Bと未所属ユーザーで、観察の取得・保存、配置履歴、分析の分離、未ログイン・ログアウト後の拒否を実プロジェクトでも確認する。今回の自動検証は一時DBとローカルのAuth応答を使い、実プロジェクトを変更しない。

### 自動検証

`npm test` は一時PostgreSQL（PGlite）で移行・RLS・匿名拒否・店舗A/B間の読み書き拒否・所属変更拒否・複合FK・全RPC・DELETE禁止を確認します。以前のSQLの再実行で匿名権限が復活しないことも検証します。

`npm run test:browser` はテスト専用Auth応答と一時DBを使い、実際のChromeでログイン、セッション復元、ログアウト、未所属・別店舗・再ログイン時の下書き復元を確認します。Phase 7のスマホ操作・保存・履歴・分析の検証も続けます。環境変数は公開テストキーで上書きし、実Supabaseへの接続は行いません。

## Phase 4 のSupabase設定（Phase 8より前の説明）

1. この節は以前の構成の説明です。現在の新規設定・移行には上のPhase 8のSQL実行順と所属登録を使ってください。
2. [.env.example](./.env.example) を `.env.local` にコピーし、プロジェクトURLと公開用の **anon key** を設定してください。
   ```dotenv
   VITE_SUPABASE_URL=プロジェクトのURL
   VITE_SUPABASE_ANON_KEY=公開用のanon_key
   VITE_STORE_NAME=店舗名
   ```
   `VITE_STORE_NAME` は任意です。`service_role` や secret keyは使用しません。`.env.local` はGitで無視されます。
3. 開発サーバーを再起動してください。Viteの環境変数は起動時／ビルド時に読み込まれるため、配信済みのアプリでは再ビルドが必要です。
4. 観察を購入または非購入で終了し、ホームの人数が更新されることと、SupabaseのTable Editorの `observations` に記録が追加されることを確認してください。
   アプリを再読み込みしても、保存済みの人数はDBから取得します。

公開キーとRLSの扱いは [Supabaseの公式ガイド](https://supabase.com/docs/guides/database/secure-data) を参照してください。

### 保存・エラー時の動作

- 購入商品を確定したとき、または非購入で終了したときに保存します。観察を破棄した場合は送信しません。
- 保存中は終了操作から保存画面へ切り替え、再送信できないようにします。
- 成功後にホームへ戻り、DBの人数を再取得します。
- 失敗時は記録を保持してエラーと「保存を再試行」を表示します。同じIDでの再試行はDBで重複を防ぎます。
- 未保存の記録はReact stateのみです。失敗時に再読み込み・タブを閉じる操作をすると失われます。
- 未設定・無効な接続設定でもアプリは起動し、開発者向けの案内を表示します。保存は設定完了後に利用できます。
- 人数の取得に失敗した場合は「—」とエラーを表示し、「人数を再取得」で再試行できます。

### DBの範囲と権限

`observations` の1テーブルに時刻・配置バージョン・結果と、JSONBのルート・接客・購入商品を保存します。
Phase 3の観察番号・観察開始時の配置コピー・複数購入フラグも保持し、`created_at` はDBで付与します。
観察番号は既存のセッション内表示用の連番で、DBの一意な識別には `id` を使います。
配置については、以下のPhase 5のテーブルとRPCを追加しています。

Phase 4では認証なしの単店舗MVPとして、公開キー利用者に保存と人数集計の2つのRPCを許可していました。
Phase 8では匿名アクセスを撤回し、ログインユーザーの自店舗データだけを許可しています。
`save_observation` は終了済みデータの追加だけを行い、既存IDを上書きしません。
`get_observation_summary` は指定日の自店舗の人数だけを返します。
SQLの関数権限は [Supabaseの公式ドキュメント](https://supabase.com/docs/guides/database/functions#secure-a-database-function) に沿って設定しています。

テストでは保存APIと設定の単体テストに加え、テスト専用PGliteのPostgreSQLでSQLの実行・再試行・日付境界・権限を検証します。
テストにはSupabaseの実接続情報は不要です。

## Phase 5 の配置履歴

- 起動時・ホームに戻る時・履歴を開く時に配置履歴を取得し、最新バージョンを現在の配置にします。
- DBに履歴がない場合は、サンプルマップを初期配置 `v1` として1回だけ保存します。
- 「配置を変更」は最新配置をコピーして編集します。保存すると `v2`、`v3` と新しいレコードを追加し、過去の配置を上書きしません。
- 変更理由は任意入力です。各配置には全ゾーンの名前・商品・カテゴリー・メモ・座標・サイズを含むスナップショットを保存します。
- 履歴は古い順にマップを表示し、バージョン間にはスタッフが入力した変更理由だけを表示します。
- 差分検出の処理は内部に残しています。自動検出した変更一覧は画面に表示しません。
- 移動位置の表現はマップ内の大まかなエリアと入口付近です。建築寸法やAIによる位置の解釈は使いません。
- 採番はDBのトランザクション内で行います。保存中の連打と、応答を失った後の同じIDでの再試行による重複を防ぎます。
- 編集開始後に別の保存が行われた場合は競合として拒否し、編集内容と変更理由を画面に保持します。ホームで最新配置を再取得して編集し直してください。
- 通信エラー時は編集を保持して再試行できます。再読み込み・タブを閉じると未保存の編集は失われます。
- Phase 8ではSupabase未設定時にログイン画面で設定案内を表示します。未認証からのローカルプレビュー経路は開きません。
- Supabase設定済みで配置取得に失敗した場合はエラーと再取得操作を表示します。取得済み配置がなければ、誤った配置で記録しないよう観察開始・編集を無効にします。

### SQL移行と観察との関連

現在の実行順はPhase 8の設定手順を参照してください。`layout-history.sql` はPhase 8適用前のDB向けです。

`layout_versions` の主な項目は `id`、`version_number`、`created_at`、`layout_snapshot`、`change_note` です。
Phase 8でstore_id・RLSによる所属店舗への限定を追加しました。配置のスナップショット・番号の上書きと削除は許可しません。

新しい観察は開始時の `layout_version_id` と `layout_version`（例：`v3`）、マップのコピーを保持します。
DBには配置IDの外部キーを追加し、保存時にID・表示バージョン・マップが同じ配置を参照することを検証します。
観察開始後に別の端末で配置が更新されても、開始時の配置との関連を維持します。
Phase 4以前の記録には配置履歴IDがなかったため、既存の文字列とスナップショットをそのまま残し、新しいID列はNULLにします。過去の配置履歴を推測して生成しません。

設定後は、配置を2回編集して `v1 → v2 → v3` と変更理由が履歴に残ること、再読み込み後も最新配置が表示されること、観察の `layout_version_id` が開始した配置を参照することを確認してください。
配置前後の顧客行動分析は以下のPhase 6で追加しています。AIの配置提案、POS連携は実装していません。

## Phase 6 の配置前後の分析

- ホームの「分析を見る」から開き、画面上部の「比較元」「比較先」で配置履歴の全バージョンを選択できます。初期選択は最新の2配置です。観察0件の配置も選べ、同じ配置同士は選択できません。
- 選択UIの下に選択中の売場ゾーンと保存時の変更理由、売場の立ち止まり率・商品購入率を表示します。移動した売場を初期選択し、両配置にある売場ゾーンをselectから自由に切り替えられます。入口・レジ・試着室は候補に含めません。配置の切り替え・再取得後も、候補に残っている売場の選択を維持します。
- 売場を変更すると、行動・接客開始・商品購入の指標、ファネル、選択中の通過率とマップの強調表示が即時更新されます。配置全体の指標・接客あり/なしの購入率は別に表示します。
- 「比較対象」には選択中の売場ゾーンと保存時の変更理由だけを表示します。他のゾーンの変更内容や自動検出一覧は表示しません。変更理由は配置全体の保存時に入力されたメモをそのまま使います。
- 観察0件の配置には「この配置にはまだ観察データがありません」と表示します。配置の選択肢は観察件数では絞り込みません。
- 観察人数、ゾーン通過・立ち止まり・商品接触・値札確認・試着・接客・購入を、人数・割合・ポイント差で比較します。
- 接客あり・なしそれぞれの購入率、商品の段階別人数を比較するファネル、各配置の通過率マップを表示します。
- 取得失敗時はエラーと再取得操作を表示します。未設定時は接続設定の案内を表示し、仮の分析値は出しません。
- 画面を開いたときだけ分析用コードを読み込みます。

### 集計基準

`get_layout_analysis` RPCが、2配置の観察と保存済みマップを同じDB読み取りで集計します。ブラウザへ観察の個別情報は返しません。
集計の基準は `layout_version_id` です。Phase 4以前のIDのない旧観察を、配置名だけで推測して割り当てません。除外人数は画面に表示します。
各配置の保存済み観察すべてが対象です。期間・曜日・時間帯の絞り込みは今回の範囲に含めません。

| 指標 | 人数・分母 |
| --- | --- |
| 観察人数 | その配置に紐づく終了・保存済み観察 |
| ゾーン通過・各行動率 | 選択したゾーンで記録された人数 / 配置の観察人数 |
| 選択売場の接客率 | そのゾーンで接客を開始した人数 / 配置の観察人数（初回と各セッションを重複排除） |
| 選択売場の購入率 | そのゾーンの商品を購入した人数 / 配置の観察人数 |
| 配置全体の接客率・購入率 | 接客あり・購入の人数 / 配置の観察人数 |
| 接客あり・なし購入率 | 各群の購入人数 / 各群の観察人数 |
| ファネルの商品購入 | 購入商品に選択されたゾーンの人数 / 配置の観察人数 |

同じ顧客の再訪・同じ行動・同じゾーンの商品を複数購入した記録は、各指標で1人として数えます。
別の観察記録は別の顧客として扱います。「その他・不明」の商品はゾーンの商品購入に含めず、配置全体の購入には含めます。
ファネルの行動は独立した記録の人数です。同じ順序で行動した人だけを数えるファネルではありません。
記録が省略された行動を補わず、通過の記録がなくても購入商品に選択されたゾーンは購入として数えます。このため後の段階で人数が増える場合があります。

分母0の場合の割合・追加または削除で存在しないゾーン・比較できない変化量は「—」「比較なし」です。
割合の差は丸める前の値から算出し、小数1桁までのポイント差として表示します。
いずれかの配置が20人未満、または接客別の群が20人未満の場合は参考値として案内します。
購入率が上昇し接客率が10ポイント以上変わった場合、接客率の変化が販売結果に影響している可能性を表示します。この基準は統計的な有意差を示すものではありません。
配置による因果関係は断定せず、期間・曜日・記録者なども異なる可能性がある観察データとして表示します。
離れた配置を選択した場合も、変更理由は保存時のメモをバージョン別に区別して表示します。新しい配置を比較元にすることも可能です。その場合も指標の差は比較先−比較元とし、変更理由には保存時の変更方向を明記します。

### Phase 6 のSQL設定（手動）

`analysis.sql` はPhase 8適用前のDB向けです。現在はPhase 8の設定手順に従い、`security.sql` の店舗限定版RPCを使用してください。
ゾーン別の接客開始人数の集計は `security.sql` にも含まれます。Phase 8適用後に `analysis.sql` を再実行する必要はありません。開始ゾーン不明の旧接客記録を、任意のゾーンに割り当てることはありません。
新規環境では `schema.sql` → `layout-history.sql` → `analysis.sql` → `security.sql` の順に実行してください。
現在の集計RPCはauthenticatedのみ実行でき、テーブルのSELECTも所属店舗に限定されます。

2配置でそれぞれ観察を保存してから「分析を見る」を開き、バージョンとゾーンを切り替えて数値を確認してください。
SQLのJSONB集計は [PostgreSQL公式ドキュメント](https://www.postgresql.org/docs/current/functions-json.html)、関数の権限は [Supabase公式ドキュメント](https://supabase.com/docs/guides/database/functions) に沿って設定しています。

## コンポーネント構成

- `src/App.jsx`：認証ゲート、店舗別画面の状態、同じ所属での下書き復元、ホーム操作
- `src/pages/LoginPage.jsx`、`Login.css`：メール・パスワードのログイン、未設定／所属未登録／エラー表示
- `src/hooks/useAuth.js`、`src/lib/authRepository.js`：セッションの検証・更新、所属確認、ログアウト
- `src/lib/securityErrors.js`：セッション切れ・権限不足の共通メッセージ
- `supabase/security.sql`：店舗・所属・store_id移行、RLS、店舗限定RPC、匿名権限撤回
- `src/lib/securitySchema.test.js`、`authRepository.test.js`：RLS・店舗分離・認証の検証
- `src/pages/HomePage.jsx`：ホーム画面の構成
- `src/pages/StoreMapEditorPage.jsx`：店舗マップ編集・保存・未保存の変更の管理
- `src/pages/ObservationPage.jsx`：顧客観察の状態遷移と操作
- `src/pages/Observation.css`：観察・接客・購入選択のスマホ向けスタイル
- `src/components/observation/`：観察用マップ、ルート、イベント、接客、購入候補、終了ボタン
- `src/lib/observation.js`：観察データ・取り消し・接客・終了処理
- `src/lib/observation.test.js`：観察データと状態遷移のテスト
- `src/lib/supabase.js`：環境変数からのクライアント初期化・未設定／不正キーの扱い
- `src/lib/observationRepository.js`：観察データのDB形式への変換・保存・人数取得・二重送信防止
- `src/hooks/useTodaySummary.js`：人数取得・再取得・日付更新・エラー状態
- `src/hooks/useLayoutHistory.js`：最新配置・履歴取得・DB／ローカル保存・エラー状態
- `src/lib/layoutHistory.js`：自動差分比較・ローカルのバージョン追加・スナップショット検証
- `src/lib/layoutRepository.js`：配置履歴のSupabase RPC・保存の二重送信防止
- `src/pages/AnalysisPage.jsx`、`Analysis.css`：配置・ゾーンの選択とスマホ向け分析画面
- `src/components/analysis/`：人数・割合の比較カード、商品ファネル、通過率マップ
- `src/hooks/useLayoutAnalysis.js`：選択した配置の集計取得・再取得・古い応答の抑制
- `src/lib/analysis.js`、`analysisRepository.js`：割合・ポイント差・注意判定・集計RPC・応答検証
- `supabase/analysis.sql`：Phase 6の読み取り専用集計RPC
- `src/lib/analysis.test.js`、`analysisRepository.test.js`、`analysisSchema.test.js`：集計基準・API・PostgreSQLのテスト
- `src/pages/LayoutHistoryPage.jsx`、`LayoutHistory.css`：時系列の配置履歴画面
- `src/components/layout-history/`：読取専用マップ・保存時の変更理由・取得状態
- `supabase/layout-history.sql`：Phase 5のテーブル・採番・観察との関連・権限設定
- `src/lib/layoutHistory.test.js`、`layoutRepository.test.js`、`layoutSchema.test.js`：差分・保存・SQL移行のテスト
- `src/components/observation/ObservationSaveStatus.jsx`：保存中・保存失敗・再試行の画面
- `supabase/schema.sql`：観察テーブル・制約・RLS・保存／集計RPC
- `src/lib/supabase.test.js`、`observationRepository.test.js`、`supabaseSchema.test.js`：Phase 4のテスト
- `src/components/store-map/`：マップ、追加ボタン、情報編集、要素一覧
- `src/lib/storeMap.js`：移動・サイズ変更・追加・コピーの処理
- `src/lib/mapElementSizing.js`：表示中のマップで文字・アイコンを実測し、内容が収まるサイズを計算
- `src/lib/storeMap.test.js`：移動範囲・最小サイズ・保存済みデータの保護のテスト
- `src/data/initialStoreMap.js`：仮の初期配置
- `src/pages/StoreMapEditor.css`：マップ編集画面のスマホ向けスタイル
- `src/components/home/`：店舗名、配置バージョン、人数、ナビゲーション
- `src/components/ActionButton.jsx`：共通のアクションボタン
- `src/components/Icon.jsx`：外部ライブラリを使わない SVG アイコン
- `src/data/storeSettings.js`：旧表示名設定（Phase 8の表示名は`stores.name`）
- `src/hooks/useUnsavedChanges.js`：未保存の観察・編集がある時の再読み込み・離脱確認
- `scripts/field-browser-check.cjs`：一時PostgreSQLとChromeによるスマホ操作・保存・分析の確認
- `src/index.css`：共通スタイルと色の定義
- `src/App.css`：ホーム画面のレイアウトとスマホ向けスタイル

表示用データと操作は props で渡しているため、後続フェーズでデータ取得や各機能への接続を追加できます。

## Phase 7 の検証

`npm run test:browser` はChromeを起動し、実環境とは別の一時PGlite DBと公開テストキーで検証します。検証用ビルドも自動で作成します。Chromeの実行ファイルが見つからない場合は `CHROME_PATH` を設定してください。
320pxからの画面幅、ボタン・selectなどの44px以上のタップ領域、保存失敗・再試行・二重送信、配置履歴、ネイティブselectによる分析の切り替えを確認します。指定の観察は320×568、375×667、390×844で9タップ・スクロールなしの経路を検証します。
スクリーンショット・確認項目・自動入力時間は、実行結果に表示する一時フォルダーの `report.json` に出力します。自動入力時間は人の操作速度を示すものではなく、10秒の目標は実機で計測してください。
Phase 7ではDB変更はありませんでした。Phase 8の設定には `security.sql` と所属登録が必要です。変更理由は空欄でも保存でき、履歴に「変更理由の記入はありません。」と表示します。
未保存の観察（保存失敗を含む）・編集がある時はブラウザの離脱確認を利用します。ブラウザやOSによる強制終了・再読み込みでは確認が出ない場合があり、下書きの永続保存は行いません。
