#!/usr/bin/env bash

set -euo pipefail

# This script builds fuzz tests for the project and copies them to a central location.

scripts_directory="$(dirname "$(realpath "$0")")"
codeforge_directory="$(realpath "$scripts_directory/..")"
root_directory="$(realpath "$codeforge_directory/..")"
fuzzing_directory="$codeforge_directory/fuzzing"

fuzzers_list="$fuzzing_directory/.fuzzers_list"

quiet=false
clean=false
while [ $# -gt 0 ]; do
    case $1 in
        -q) quiet=true; shift ;;
        -c) clean=true; shift ;;
        *) shift ;;
    esac
done

if [[ "$clean" = true ]]; then
    [ $quiet == false ] && echo "[+] Removing fuzzers list: $fuzzers_list"
    rm -f "$fuzzers_list"
fi

if [[ -e "$fuzzers_list" ]]; then
    [ $quiet == false ] && echo "[+] Using cached fuzzers list: $fuzzers_list"
    cat "$fuzzers_list"
    exit 0
fi

cd "$root_directory"

# Create the central fuzzers directory if it doesn't exist
if [[ ! -d "$fuzzing_directory" ]]; then
    [ $quiet == false ] && echo "[+] Creating fuzzers directory: $fuzzing_directory"
    mkdir -p "$fuzzing_directory"
fi

declare -A fuzzer_targets

presets=$(cmake . --list-presets | tail +2 | awk -F'"' '{print $2}')

for p in $presets; do
    [ $quiet == false ] && echo "[+] configuring preset: $p"

    # Create a temporary build directory
    build_dir="$fuzzing_directory/build-$p"
    rm -rf "$build_dir"
    mkdir "$build_dir"

    # Configure with the preset
    set +e 
    cmake --preset "$p" -S . -B "$build_dir" 1>/dev/null 2>&1
    if [ $? -ne 0 ]; then
        [ $quiet == false ] && echo "[+] Failed to configure preset $p - skipping"
        rm -rf "$build_dir"
        continue
    fi
    set -e

    # Capture the list of targets
    [ $quiet == false ] && echo "[+] gathering list of targets"
    set +e 
    targets=$(cmake --build "$build_dir" --target help 2> /dev/null | grep ": phony" | awk -F':' '{print $1}' | grep -E '^codeforge-.*-fuzz$')
    set -e

    if [[ "$targets" == "" ]]; then
        [ $quiet == false ] && echo "[+] no fuzz targets found for preset $p"
        rm -rf "$build_dir"
        continue
    else 
        for t in $targets; do
            fuzzer_targets["$t"]="$p"
        done
    fi
done

if [ ${#fuzzer_targets[@]} -eq 0 ]; then
    echo "[!] No fuzz targets found in any preset."
    exit 1
fi

[ $quiet == false ] && echo "List of presets and fuzzers:"
for fuzzer in "${!fuzzer_targets[@]}"; do
    echo "${fuzzer_targets[$fuzzer]}:$fuzzer"
    echo "${fuzzer_targets[$fuzzer]}:$fuzzer" >> "$fuzzers_list"
done
