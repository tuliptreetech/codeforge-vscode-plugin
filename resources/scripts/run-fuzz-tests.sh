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
    output=$(LLVM_PROFILE_FILE=mytest.profraw "$fuzzer" -fork=1 -ignore_crashes=1 -jobs=8 -runs=16 -create_missing_dirs=1 corpus 2>&1)
    exit_code=$?

    # Extract the number of runs from the fuzzer output
    # LibFuzzer with -jobs=N runs multiple workers, each outputting their own test count
    # We need to sum up all the test cases from all jobs
    # Look for lines like "INFO: fuzzed for 47120 iterations, wrapping up soon"
    job_runs=$(echo "$output" | grep -oE 'fuzzed for [0-9]+ iterations' | grep -oE '[0-9]+')

    if [ -n "$job_runs" ]; then
        # Sum up all the runs from all jobs
        runs=0
        for count in $job_runs; do
            runs=$((runs + count))
        done
    else
        # Fallback: try other patterns for different LibFuzzer output formats
        # Look for "Done N runs in X second(s)"
        job_runs=$(echo "$output" | grep -oE 'Done [0-9]+ runs' | grep -oE '[0-9]+')
        if [ -n "$job_runs" ]; then
            runs=0
            for count in $job_runs; do
                runs=$((runs + count))
            done
        else
            # Fallback: try the old method for single-threaded runs
            runs=$(echo "$output" | grep -oE '#[0-9]+' | tail -1 | tr -d '#')
            if [ -z "$runs" ]; then
                runs=$(echo "$output" | grep -oE 'stat::number_of_executed_units: [0-9]+' | grep -oE '[0-9]+')
            fi
            if [ -z "$runs" ]; then
                runs=0
            fi
        fi
    fi

    echo "[+] Fuzzer executed $runs test cases"

    # Store the total test count in a file in the fuzzing directory
    test_count_file="$fuzzer_output_directory/test-count.txt"
    if [ -f "$test_count_file" ]; then
        previous_count=$(cat "$test_count_file")
        echo "[+] Added $runs to previous count of $previous_count"
        runs=$((runs + previous_count))
    fi
    echo "$runs" > "$test_count_file"
    echo "[+] Total fuzz test cases executed: $runs (saved to $test_count_file)"

    if [ $exit_code -ne 0 ]; then
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

