#!/bin/bash
set -e

# Claude Phone CLI Installer
# Usage: curl -sSL https://raw.githubusercontent.com/.../install.sh | bash

INSTALL_DIR="$HOME/.claude-phone-cli"
REPO_URL="https://github.com/CFBR/open-agent-phone.git"

echo "🎯 Claude Phone CLI Installer"
echo ""

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin*)
    echo "✓ Detected macOS"
    BIN_DIR="/usr/local/bin"
    PKG_MANAGER="brew"
    ;;
  Linux*)
    echo "✓ Detected Linux"
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"
    # Detect package manager
    if command -v apt-get &> /dev/null; then
      PKG_MANAGER="apt"
    elif command -v dnf &> /dev/null; then
      PKG_MANAGER="dnf"
    elif command -v pacman &> /dev/null; then
      PKG_MANAGER="pacman"
    else
      PKG_MANAGER="unknown"
    fi
    ;;
  *)
    echo "✗ Unsupported OS: $OS"
    exit 1
    ;;
esac

# Function to install Node.js
install_nodejs() {
  echo ""
  echo "📦 Installing Node.js..."
  case "$PKG_MANAGER" in
    apt)
      # Install Node.js 20.x LTS via NodeSource
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
      ;;
    dnf)
      sudo dnf install -y nodejs npm
      ;;
    pacman)
      sudo pacman -S --noconfirm nodejs npm
      ;;
    brew)
      brew install node
      ;;
    *)
      echo "✗ Cannot auto-install Node.js on this system"
      echo "  Install manually from: https://nodejs.org/"
      exit 1
      ;;
  esac
  echo "✓ Node.js installed: $(node -v)"
}

# Function to install Docker
install_docker() {
  echo ""
  echo "📦 Installing Docker..."
  case "$PKG_MANAGER" in
    apt)
      # Install Docker via official script
      curl -fsSL https://get.docker.com | sudo sh
      sudo usermod -aG docker $USER
      echo "⚠️  You may need to log out and back in for Docker group to take effect"
      ;;
    dnf)
      sudo dnf install -y docker
      sudo systemctl start docker
      sudo systemctl enable docker
      sudo usermod -aG docker $USER
      ;;
    pacman)
      sudo pacman -S --noconfirm docker
      sudo systemctl start docker
      sudo systemctl enable docker
      sudo usermod -aG docker $USER
      ;;
    brew)
      echo "📦 Docker Desktop required on macOS"
      echo "  Install from: https://www.docker.com/products/docker-desktop"
      echo ""
      read -p "Press Enter after installing Docker Desktop..."
      ;;
    *)
      echo "✗ Cannot auto-install Docker on this system"
      echo "  Install from: https://docs.docker.com/engine/install/"
      exit 1
      ;;
  esac
}

# Function to install git
install_git() {
  echo ""
  echo "📦 Installing git..."
  case "$PKG_MANAGER" in
    apt)
      sudo apt-get update && sudo apt-get install -y git
      ;;
    dnf)
      sudo dnf install -y git
      ;;
    pacman)
      sudo pacman -S --noconfirm git
      ;;
    brew)
      brew install git
      ;;
    *)
      echo "✗ Cannot auto-install git"
      exit 1
      ;;
  esac
  echo "✓ Git installed"
}

echo ""
echo "Checking prerequisites..."
echo ""

# Check git
if ! command -v git &> /dev/null; then
  echo "✗ Git not found"
  read -p "  Install git automatically? (Y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    install_git
  else
    exit 1
  fi
else
  echo "✓ Git installed"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "✗ Node.js not found"
  read -p "  Install Node.js automatically? (Y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    install_nodejs
  else
    echo "  Install manually from: https://nodejs.org/"
    exit 1
  fi
else
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    echo "✗ Node.js 18+ required (found v$NODE_VERSION)"
    read -p "  Upgrade Node.js automatically? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      install_nodejs
    else
      exit 1
    fi
  else
    echo "✓ Node.js $(node -v)"
  fi
fi

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "✗ Docker not found"
  read -p "  Install Docker automatically? (Y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    install_docker
  else
    echo "  Install from: https://docs.docker.com/engine/install/"
    exit 1
  fi
else
  echo "✓ Docker installed"
fi

# Check Docker permissions (Linux only)
if [ "$OS" = "Linux" ]; then
  if ! docker info &> /dev/null 2>&1; then
    echo "⚠️  Docker permission issue"
    echo "  Adding user to docker group..."
    sudo usermod -aG docker $USER
    echo "  ⚠️  You need to log out and back in, OR run: newgrp docker"
    echo ""
    read -p "Continue anyway? (Y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
      exit 1
    fi
  fi
fi

# Check Claude CLI (optional - only needed for API server)
if ! command -v claude &> /dev/null; then
  echo "⚠️  Claude CLI not found (needed for API server only)"
  echo "  Install from: https://claude.ai/download"
else
  echo "✓ Claude CLI installed"
fi

# Clone or update repository
echo ""
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull origin main
else
  echo "Cloning Claude Phone..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install CLI dependencies
echo ""
echo "Installing dependencies..."
cd "$INSTALL_DIR/cli"
npm install --silent --production

# Create symlink
echo ""
if [ -L "$BIN_DIR/claude-phone" ]; then
  rm "$BIN_DIR/claude-phone"
fi

if [ "$OS" = "Linux" ]; then
  ln -s "$INSTALL_DIR/cli/bin/claude-phone.js" "$BIN_DIR/claude-phone"
  echo "✓ Installed to: $BIN_DIR/claude-phone"

  if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo "⚠️  Adding $HOME/.local/bin to PATH..."
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    export PATH="$HOME/.local/bin:$PATH"
  fi
else
  if [ -w "$BIN_DIR" ]; then
    ln -s "$INSTALL_DIR/cli/bin/claude-phone.js" "$BIN_DIR/claude-phone"
  else
    sudo ln -s "$INSTALL_DIR/cli/bin/claude-phone.js" "$BIN_DIR/claude-phone"
  fi
  echo "✓ Installed to: $BIN_DIR/claude-phone"
fi

echo ""
echo "════════════════════════════════════════════"
echo "✓ Installation complete!"
echo "════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  claude-phone setup    # Configure your installation"
echo "  claude-phone start    # Launch services"
echo ""
