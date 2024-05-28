SOFTRF_VERSION=3bce09e27ed815460a3640aa415f862a3f5b07fa

all: clone-gdl90-library
	make udp
	make test

clone-gdl90-library:
	@if ! test -f "gdl90.c";\
	then make clone-softrf;\
	fi

clone-softrf:
	-mkdir tmp
	-cd tmp && git clone https://github.com/lyusupov/SoftRF.git softrf
	cd tmp/softrf && git checkout $(SOFTRF_VERSION)
	cp tmp/softrf/software/firmware/source/libraries/rotobox/*.* .
	-rm -rf tmp

udp:
	gcc -D RASPBERRY_PI gdl90*.c main-udp.c -o gdl90-udp

test:
	gcc -D RASPBERRY_PI gdl90*.c main-test.c -o gdl90-test

file=""
xxd:
	xxd $(file)

clean: clean-src
	-rm gdl90-udp
	-rm gdl90-test

clean-src:
	-rm gdl90.*
	-rm portable_endian.h
	-rm -rf tmp
	-rm README.md

.PHONY:
	udp test
