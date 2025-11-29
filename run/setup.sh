#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
cd "$project_root"

python_bin="${PYTHON_BIN:-python3}"
if ! command -v "$python_bin" >/dev/null 2>&1; then
  python_bin="python"
fi

venv_dir="${VENV_DIR:-.venv}"
if [ ! -d "$venv_dir" ]; then
  echo "Creating virtual environment at ${venv_dir}..."
  "$python_bin" -m venv "$venv_dir"
fi

# shellcheck source=/dev/null
source "${venv_dir}/bin/activate"

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m playwright install chromium

echo "Setup completed. Activate the environment with 'source ${venv_dir}/bin/activate' before running npm scripts or python commands."
