#!/usr/bin/env bash

set -euo pipefail

# This script finds the crash hashes for a given fuzz test (or all of them)

scripts_directory="$(dirname "$(realpath "$0")")"
codeforge_directory="$(realpath "$scripts_directory/..")"
root_directory="$(realpath "$codeforge_directory/..")"
fuzzing_directory="$codeforge_directory/fuzzing"

cd "$root_directory"

if [ $# -gt 0 ]; then
    fuzzers="$1"
else 
    fuzzers=$($scripts_directory/find-fuzz-tests.sh -q)
fi

for f in $fuzzers; do
    IFS=":" read -r preset fuzzer_name <<< "$f"

    output_dir="$fuzzing_directory/$fuzzer_name-output"

    if [[ ! -d "$output_dir" ]]; then
        continue
    fi

    rm -f ${output_dir}/crash-*
    rm -f ${output_dir}/backtrace-*
    rm -f ${output_dir}/test-count.txt
done