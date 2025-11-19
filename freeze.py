
from flask_frozen import Freezer
from main import app

# Flask アプリを静的 HTML に書き出す設定。
# GitHub Pages で `/<repo-name>/` 以下にホストされると `/static/...` のような
# ルートパスが 404 になるため、相対 URL を生成するように設定する。
app.config['FREEZER_DESTINATION'] = 'docs'
app.config['FREEZER_RELATIVE_URLS'] = True
freezer = Freezer(app)

if __name__ == '__main__':
    # `python freeze.py` で静的サイトを生成する。
    freezer.freeze()
