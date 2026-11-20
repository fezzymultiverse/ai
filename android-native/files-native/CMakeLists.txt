cmake_minimum_required(VERSION 3.22.1)
project(horizon_files C)
add_library(horizon_files SHARED horizon_files.c)
target_compile_options(horizon_files PRIVATE -Wall -Wextra -Werror)
# Android 15+ devices may use 16KB pages.
target_link_options(horizon_files PRIVATE "-Wl,-z,max-page-size=16384")
