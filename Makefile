PACKAGE   = web-cache
MOCHA     = ./node_modules/mocha/bin/mocha
MOCHAOPTS =
NPM      ?= npm

all: deps test

deps: package.json
	@ $(NPM) install
	
test: deps
	@ $(MOCHA) $(MOCHAOPTS)
	
.PHONY: test deps all