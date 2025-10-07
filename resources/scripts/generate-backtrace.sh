#!/usr/bin/env bash

set -euo pipefail

# This script builds fuzz tests for the project and copies them to a central location.

scripts_directory="$(dirname "$(realpath "$0")")"
codeforge_directory="$(realpath "$scripts_directory/..")"
root_directory="$(realpath "$codeforge_directory/..")"
fuzzing_directory="$codeforge_directory/fuzzing"

cd "$root_directory"

if [ $# -lt 1 ]; then
    exit 1
fi
fuzzer_and_crash_hash="$1"

IFS="/" read -r fuzzer_name crash_hash <<< "$fuzzer_and_crash_hash"

output_dir="$fuzzing_directory/$fuzzer_name-output"
backtrace_output_file=$output_dir/backtrace-$crash_hash.txt

if [[ ! -d "$output_dir" ]]; then
    exit 1
fi

if [[ -e "$backtrace_output_file" ]]; then
    cat "$backtrace_output_file"
    exit 0
fi

crash_file="$output_dir/crash-$crash_hash"
exe="$fuzzing_directory/$fuzzer_name"

gdb -batch -ex "run" -ex "bt full" -ex "quit" "$exe" "$crash_file" 2>/dev/null | tee "$backtrace_output_file"
