cmake_minimum_required(VERSION 3.22)

project(CODEFORGE_EXAMPLE_FUZZ)

set(CMAKE_C_STANDARD                11)
set(CMAKE_CXX_STANDARD              17)
set(CMAKE_C_COMPILER             "/usr/bin/clang")
set(CMAKE_ASM_COMPILER           "/usr/bin/clang")
set(CMAKE_CXX_COMPILER           "/usr/bin/clang++")

set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=fuzzer,address -fcoverage-mapping -fprofile-instr-generate -DCPPUTEST_MEM_LEAK_DETECTION_DISABLED")

set(EXE_NAME "codeforge-cmake-example-fuzz")
add_executable(${EXE_NAME} src/main.cpp)

