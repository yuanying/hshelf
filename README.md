# hshelf

ディレクトリに置いた画像を、ブラウザで一覧・閲覧するための Web アプリ。

## これは何か

設定したディレクトリを辿り、サブディレクトリと画像をサムネイルの一覧で見せる。画像を開くと PhotoSwipe のビューアで順に送れる。画像と同じ名前の `.mp4` があれば、再生ボタンを付けて動画へのリンクを出す。

- 対応する画像: `.png` `.jpg` `.jpeg` `.gif`（拡張子の大文字・小文字の一部を含む）
- サムネイルは 256x256 の正方形（中央を切り抜く）。GIF は最初のコマを使う。ディレクトリのサムネイルは、その中で最初に見つかった画像である
- サムネイルと画像の寸法（メタデータ）は、初めて要求されたときに作り、`tmp_dir` に置いて使い回す

サーバーは Sinatra（Ruby）、画面は Mithril を webpack で束ねたもの。画像の処理には ImageMagick を使う。

旧名は aphrael。名前を hshelf に改めた。Ruby のモジュール名（`Aphrael::`）と設定の環境変数（`APHRAEL_CONFIG`）は旧名のまま残している。

## 設定

`configs/config.yml` を読む。環境変数 `APHRAEL_CONFIG` で別のパスを指せる。

```yaml
image_dirs:
  - path: /opt/data/images   # 見せるディレクトリ
    name: My Images          # 画面に出す名前
tmp_dir: /opt/data/cache     # サムネイルとメタデータの置き場
```

`image_dirs` は複数書ける。トップページに `name` が並ぶ。`path` は画面にもAPIにも出ない。

## 動かし方

イメージは `ghcr.io/yuanying/hshelf`（linux/amd64）。

```sh
docker run -p 9292:9292 \
  -v /path/to/config.yml:/myapp/configs/config.yml:ro \
  -v /opt/data:/opt/data \
  ghcr.io/yuanying/hshelf:<version>
```

イメージは `RACK_ENV=production` で thin を動かし、ポート 9292 で待つ。

**production では、サーバーは画像やサムネイルを自分で返さない。** 応答の `X-Accel-Redirect` ヘッダーにファイルのパスを書き、手前の nginx に返させる。nginx には、`image_dirs` と `tmp_dir` を含むパスを `internal` の location として置き、同じパスでファイルが見えるようにする。

```nginx
location / {
    proxy_pass http://hshelf-server;
}
location /opt/data/ {
    root /;
    internal;
}
```

nginx とは unix ソケットでもつなげる。

```sh
bundle exec thin -R config.ru -e production --socket /tmp/socket/hshelf.sock start
```

`RACK_ENV` を production 以外にすると、サーバーがファイルを直接返す。development は `sinatra-contrib` の reloader を使うので、その gem が入った環境（下の開発の手順）で動かす。

## 開発

```sh
npm ci
npm run build        # dist/js に main.js を出す
npm run lint

bundle install
bundle exec ruby test/server_test.rb
bundle exec thin -R config.ru -p 9292 start
```

テストには ImageMagick（`convert`・`identify`）が要る。`docker build --target test .` は、イメージの中でテストを走らせる。

## リリース

`v*` のタグを push すると、GitHub Actions がイメージを build して `ghcr.io/yuanying/hshelf` に push する。タグ `v1.2.3` は、イメージのタグ `1.2.3`・`1.2`・`latest` になる。`main` への push では、テストと build の後にイメージのタグ `main` として push し、`main` から外れて untagged になった古いイメージを消す（タグの付いたイメージは消さない）。Pull Request では、テストと build だけを行う。

イメージには OCI のラベル `org.opencontainers.image.source`（このリポジトリの URL）と `org.opencontainers.image.revision`（コミットの SHA）を付ける。`main` は、脆弱性の集計役が「`main` では直ったが、まだリリースしていない」を見分けるためにスキャンする。

依存（Dockerfile のベースイメージ、Gem、npm、GitHub Actions）は Renovate が追う。
