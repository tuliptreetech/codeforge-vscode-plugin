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
    IFS=":" read -r preset fuzzer_name crash_id <<< "$f"

    output_dir="$fuzzing_directory/$fuzzer_name-output"
    fixed_crashes_dir="$output_dir/fixed-crashes"

    if [[ ! -d "$output_dir" ]]; then
        continue
    fi

    fuzzer="$fuzzing_directory/$fuzzer_name"

    if [[ -n "$crash_id" ]]; then
        file="$output_dir/crash-$crash_id"
        if [[ -e "$file" ]]; then
            $fuzzer "$file" 2>&1
            if [ $? -eq 0 ]; then
                mkdir -p "$fixed_crashes_dir"
                mv $file "$fixed_crashes_dir/"
            fi
        fi
    else
        for file in ${output_dir}/crash-*; do
            if [[ -e "$file" ]]; then
                set +e
                $fuzzer "$file" 2>&1
                if [ $? -eq 0 ]; then
                    mkdir -p "$fixed_crashes_dir"
                    mv $file "$fixed_crashes_dir/"
                fi
                set -e
            fi
        done
    fi
done