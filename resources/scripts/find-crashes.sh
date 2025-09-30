#!/usr/bin/env bash

set -euo pipefail

# This script builds fuzz tests for the project and copies them to a central location.

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
        exit 0
    fi

    for file in ${output_dir}/crash-*; do
        if [[ -e "$file" ]]; then
            echo "$fuzzer_name/$(basename $file | sed 's/^crash-//')"
        fi
    done
done