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

echo "[+] Building fuzzers"
for f in $fuzzers; do
    set +e
    output=$($scripts_directory/build-fuzz-tests.sh $f)
    if [ $? -ne 0 ]; then
        echo "[!] Failed to build fuzz tests"
        echo "$output"
        exit 1
    fi
    set -e
done

echo "[+] Running fuzzers"
for f in $fuzzers; do
    IFS=":" read -r preset fuzzer_name <<< "$f"

    fuzzer="$fuzzing_directory/$fuzzer_name"
    fuzzer_output_directory="$fuzzing_directory/$fuzzer_name-output"

    mkdir -p "$fuzzer_output_directory"
    echo "[+] running fuzzer: $fuzzer"
    pushd "$fuzzer_output_directory" >/dev/null
    # Run the fuzzer with some initial parameters to generate corpus
    # Using -fork=1 to avoid issues with parallel execution in initial runs
    # Using -ignore_crashes=1 to avoid stopping on initial crashes
    # Using -jobs=8 to utilize multiple cores
    # Using -runs=16 to limit the number of runs for initial corpus generation
    # Using -create_missing_dirs=1 to ensure corpus directories are created
    # Using LLVM_PROFILE_FILE to generate coverage data
    set +e
    output=$(LLVM_PROFILE_FILE=mytest.profraw "$fuzzer" -fork=1 -ignore_crashes=1 -jobs=8 -runs=16 -create_missing_dirs=1 corpus)
    if [ $? -ne 0 ]; then
        echo "[+] fuzzer $fuzzer encountered errors!"
        echo "$output"
        for crash_file in corpus/crash-*; do
            if [ -f "$crash_file" ]; then
                echo "[+] Found crash file: $crash_file"
                echo "[+] Contents of crash file:"
                hexdump -C "$crash_file"
            fi
        done
        # Continue to next fuzzer even if this one fails
    fi
    set -e

    popd >/dev/null
done
