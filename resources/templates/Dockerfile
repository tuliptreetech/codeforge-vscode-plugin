# specify the base image (latest ubuntu lts release as of Oct 2024)
FROM ubuntu:24.04

# remove pre-installed 'ubuntu' user
RUN touch /var/mail/ubuntu && chown ubuntu /var/mail/ubuntu && userdel -r ubuntu

# Installing certain packages requires timezone and insists on requesting user input
#  These settings ensure that package installation is hands-off
ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# Install development packages
RUN apt-get update
RUN apt-get install -y --no-install-recommends \
    sudo \
    build-essential \
    gcc-arm-none-eabi \
    git \
    tzdata \
    gcovr \
    meld \
    cpputest \
    pkg-config \
    cmake \
    sloccount \
    cppcheck cppcheck-gui \
    clang clang-tidy clang-format libclang-rt-18-dev gdb \
    gdbserver \
    ninja-build \
    just \
    python3-pip


#################
# Fix file ownership and permissions issues between WSL and Devcontainer
#   See this video (minute 13) for more info: https://www.youtube.com/watch?v=F6PiU-SSRWs
#   That video's exact suggestions didn't work:
#      RUN groupadd --gid 1000 vscode && \
#         useradd --uid 1000 --gid 1000 -G plugdev,dialout --shell /bin/bash -m vscode && \
#         echo "vscode ALL=(ALL:ALL) NOPASSWD:ALL" > /etc/sudoers.d/vscode
#   But, creating a user in the container that matches the user in WSL works well.
# After creating that user, run as that user in the container by default, instead of root
#################
ARG USERNAME
ARG USERID
RUN groupadd --gid $USERID $USERNAME && \
    useradd --gid $USERID -u $USERID -G plugdev,dialout --shell /bin/bash -m $USERNAME && \
    mkdir -p /etc/sudoers.d && \
    echo "$USERNAME ALL=(ALL:ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME

USER $USERNAME