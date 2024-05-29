SOFTRF_VERSION=1.5.1

all: clone-gdl90-library
	make udp
	make test

clone-gdl90-library:
	test -f "SoftRF-rotobox/gdl90.c" || make clone-softrf

clone-softrf:
	test -d softrf || git clone https://github.com/lyusupov/SoftRF.git softrf
	cd softrf && git checkout $(SOFTRF_VERSION)
	rsync -avz softrf/software/firmware/source/libraries/rotobox/ SoftRF-rotobox/ && rsync softrf/LICENSE SoftRF-rotobox/SoftRF-LICENSE.txt
	-rm -rf softrf

udp:
	gcc -D RASPBERRY_PI -ISoftRF-rotobox SoftRF-rotobox/*.c gdl90_ext.c main-udp.c -o gdl90-udp

test:
	gcc -D RASPBERRY_PI -ISoftRF-rotobox SoftRF-rotobox/*.c gdl90_ext.c main-test.c -o gdl90-test

file=""
xxd:
	xxd $(file)

clean: clean-src
	-rm gdl90-udp gdl90-test

clean-src:
	-rm -f SoftRF-rotobox/?*.*
	-rm -rf softrf

.PHONY:
	udp test
