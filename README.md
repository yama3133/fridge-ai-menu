# 冷蔵庫AI献立アプリ

冷蔵庫の写真を撮るだけで、食材を自動認識してAIが献立を提案するWebアプリです。

**デモ：** https://fridge-ai-app.vercel.app

---

## 機能

- 冷蔵庫の写真をアップロード or カメラで撮影
- Google Cloud Vision API（OCR）でラベルの文字を読み取り食材を特定
- AWS Bedrock（Claude Sonnet 4.5）が食材に合わせた献立を提案
- スマホ・デスクトップ両対応（iOS SafariのDynamic Island対応済み）

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド | Next.js 14 / TypeScript / CSS Modules |
| OCR | Google Cloud Vision API (TEXT_DETECTION) |
| AI献立提案 | AWS Bedrock — Claude Sonnet 4.5 |
| デプロイ | Vercel |

## ローカル開発

### 必要なもの

- Node.js 18+
- Google Cloud サービスアカウントキー（Vision API 有効化済み）
- AWS アクセスキー（Bedrock 有効化済み、リージョン: us-east-1）

### セットアップ

```bash
git clone https://github.com/yama3133/fridge-ai-menu.git
cd fridge-ai-menu
npm install
```

`.env.local` を作成：

```
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GOOGLE_CLOUD_PROJECT=your-project-id
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

Google Cloud サービスアカウントキー（JSONファイル）を `service-account-key.json` として配置。

```bash
npm run dev
```

http://localhost:3000 で起動します。

### Vercel へのデプロイ

Vercel の環境変数に以下を設定してください。`GOOGLE_APPLICATION_CREDENTIALS` の代わりに、JSONファイルをBase64エンコードした値を使用します。

```bash
# JSONをBase64に変換
base64 -i service-account-key.json
```

| 環境変数 | 値 |
|---|---|
| `GOOGLE_CREDENTIALS_BASE64` | 上記のBase64文字列 |
| `GOOGLE_CLOUD_PROJECT` | GCPプロジェクトID |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWSアクセスキー |
| `AWS_SECRET_ACCESS_KEY` | AWSシークレットキー |

## 仕組み

1. アップロードされた画像を Vision API の `TEXT_DETECTION` でOCR処理
2. ラベルに書かれた商品名・食材名のテキストを抽出
3. OCRテキスト＋画像をClaudeに渡し、食材の特定と献立提案を依頼
4. Claudeは「テキストを最優先、形状・色のみでの推測禁止」のルールで回答

> OCRでラベル文字を読むことで、Google レンズと同等の精度で食材を特定します。
