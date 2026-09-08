PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin

COMMAND := awso
MAKEFILE_DIR := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))
SOURCE := $(MAKEFILE_DIR)$(COMMAND)
DESTINATION := $(BINDIR)/$(COMMAND)

.PHONY: install uninstall

install:
	@mkdir -p "$(BINDIR)"
	@if [ -L "$(DESTINATION)" ] && [ "$$(readlink "$(DESTINATION)")" = "$(SOURCE)" ]; then \
		printf '%s\n' "Already installed: $(DESTINATION) -> $(SOURCE)"; \
	elif [ -e "$(DESTINATION)" ] || [ -L "$(DESTINATION)" ]; then \
		printf '%s\n' "Refusing to replace existing path: $(DESTINATION)" >&2; \
		exit 1; \
	else \
		ln -s "$(SOURCE)" "$(DESTINATION)"; \
		printf '%s\n' "Installed: $(DESTINATION) -> $(SOURCE)"; \
	fi

uninstall:
	@if [ -L "$(DESTINATION)" ] && [ "$$(readlink "$(DESTINATION)")" = "$(SOURCE)" ]; then \
		rm "$(DESTINATION)"; \
		printf '%s\n' "Removed: $(DESTINATION)"; \
	elif [ -e "$(DESTINATION)" ] || [ -L "$(DESTINATION)" ]; then \
		printf '%s\n' "Refusing to remove path not installed by this Makefile: $(DESTINATION)" >&2; \
		exit 1; \
	else \
		printf '%s\n' "Not installed: $(DESTINATION)"; \
	fi
