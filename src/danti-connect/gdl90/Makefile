all:
	make udp
	make basic

udp:
	gcc gdl90*.c main-udp.c -o gdl90-udp

basic:
	gcc gdl90*.c main-basic.c -o gdl90-basic

file=""
xxd:
	xxd $(file)

.PHONY:
	udp basic
