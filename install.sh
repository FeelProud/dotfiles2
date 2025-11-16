#!/bin/sh

set -e # -e: exit on error

# Set some colors for output messages
OK="$(tput setaf 2)[OK]$(tput sgr0)"
ERROR="$(tput setaf 1)[ERROR]$(tput sgr0)"
NOTE="$(tput setaf 3)[NOTE]$(tput sgr0)"
WARN="$(tput setaf 5)[WARN]$(tput sgr0)"
CAT="$(tput setaf 6)[ACTION]$(tput sgr0)"
ORANGE=$(tput setaf 166)
YELLOW=$(tput setaf 3)
RESET=$(tput sgr0)

original_dir="$(pwd)"

sudo pacman -Sy --noconfirm archlinux-keyring 2>&1
sudo pacman -Sy --noconfirm base-devel 2>&1

cd /tmp

if [ ! "$(command -v paru)" ]; then
  if [ ! "$(command -v git)" ]; then
    sudo pacman -Sy --noconfirm git 2>&1 || { printf "%s - Failed to install git using AUR\n" "${ERROR}"; exit 1; }
  fi
  if [ ! "$(command -v curl)" ]; then
    sudo pacman -Sy --noconfirm curl 2>&1 || { printf "%s - Failed to install git using AUR\n" "${ERROR}"; exit 1; }
  fi

  git clone https://aur.archlinux.org/paru-bin.git || { printf "%s - Failed to clone paru-bin from AUR\n" "${ERROR}"; exit 1; }
  cd paru-bin || { printf "%s - Failed to enter paru directory\n" "${ERROR}"; exit 1; }
  makepkg -si --noconfirm 2>&1 || { printf "%s - Failed to install paru-bin from AUR\n" "${ERROR}"; exit 1; }
  paru -Syu --noconfirm 2>&1 || { printf "%s - Failed to update system\n" "${ERROR}"; exit 1; }
  cd "$original_dir"
fi
  
if [ ! "$(command -v chezmoi)" ]; then
  paru -Syu --noconfirm chezmoi 2>&1
fi

script_dir="$(cd -P -- "$(dirname -- "$(command -v -- "$0")")" && pwd -P)"

chezmoi_path="$(command -v chezmoi)"
if [ -z "$chezmoi_path" ]; then
    printf "%s - chezmoi command not found after installation\n" "${ERROR}"
    exit 1
fi

exec "chezmoi" init --apply "--source=$script_dir"
