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

    build_dir="$fuzzing_directory/build-$preset"

    if [[ ! -d "$build_dir" ]]; then
        # Configure with the preset
        set +e 
        cmake --preset "$preset" -S . -B "$build_dir" 1>/dev/null 2>&1
        if [ $? -ne 0 ]; then
            [ $quiet == false ] && echo "[+] Failed to configure preset $p - skipping"
            rm -rf "$build_dir"
            continue
        fi
        set -e
    fi

    echo "[+] building target: $fuzzer_name in preset: $build_dir"
    set +e
    cmake_command="cmake --build $build_dir --target $fuzzer_name"
    output=$($cmake_command 2>&1)
    retval=$?
    if [ $retval -ne 0 ]; then
        echo "[!] Failed to build target $fuzzer_name"
        echo "$cmake_command"
        echo "$output"
        exit $retval
    fi
    set -e

    # Find the built executable (it could be in various subdirectories)
    executable_path=$(find "$build_dir" -name "$fuzzer_name" -type f -executable 2>/dev/null | head -1)
    
    echo "[+] copying $fuzzer_name"
    fuzzer="$fuzzing_directory/$fuzzer_name"
    cp -p "$executable_path" "$fuzzer"
    # Ensure executable permissions are preserved
    chmod +x "$fuzzer"
    echo "[+] built fuzzer: $fuzzer_name"
done