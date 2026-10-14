UUID := $(shell jq -r .uuid metadata.json)
SRC := $(CURDIR)
EXT_DIR := $(HOME)/.local/share/gnome-shell/extensions
INSTALL_DIR := $(EXT_DIR)/$(UUID)
EXT_FILES := metadata.json extension.js

SHELL_BIN := /usr/bin/gnome-shell

.PHONY: all help install uninstall enable disable reenable package check clean logs

all: help

help:
	@echo "Targets:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install:
	@mkdir -p "$(EXT_DIR)"
	@rm -rf "$(INSTALL_DIR)"
	@ln -sfn "$(SRC)" "$(INSTALL_DIR)"
	@echo "Linked $(INSTALL_DIR) -> $(SRC)"
	@echo "On Wayland: log out and back in, then 'make enable'."

uninstall: disable
	@rm -rf "$(INSTALL_DIR)"
	@echo "Removed $(INSTALL_DIR)"

enable:
	@gnome-extensions enable "$(UUID)" && echo "Enabled $(UUID)"

disable:
	@-gnome-extensions disable "$(UUID)" && echo "Disabled $(UUID)"

reenable:
	@-gnome-extensions disable "$(UUID)"
	@gnome-extensions enable "$(UUID)"

package: clean
	@gnome-extensions pack --force -o . .
	@echo "Built $(UUID).shell-extension.zip"

check:
	@node -e 'JSON.parse(require("fs").readFileSync("metadata.json", "utf8"))' && echo "metadata.json OK"
	@tmp=$$(mktemp --suffix=.mjs); cp extension.js "$$tmp"; node --check "$$tmp"; rm -f "$$tmp"; echo "extension.js OK"

logs:
	@journalctl -f -o cat "$(SHELL_BIN)"

clean:
	@rm -f "$(UUID).shell-extension.zip" "$(UUID).zip"
