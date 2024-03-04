DAIDALUS_VERSION=2.0.4
DAIDALUS_JAR:=DAIDALUSv$(DAIDALUS_VERSION).jar

all: xpc xplane-connection

test-xplane:
	@java -jar dist/XPlaneConnection.jar

xplane-connection:
	cp ../../danti-utils/lib/$(DAIDALUS_JAR) dist
	javac -cp dist/XPC-1.3.RC5.jar:../../danti-utils/lib/$(DAIDALUS_JAR) src/*.java
	# selecting library $(DAIDALUS_JAR) for the manifest file
	cd src && printf "Main-Class: XPlaneConnection\nClass-Path: XPC-1.3.RC5.jar $(DAIDALUS_JAR)\n" > MANIFEST.MF
	cd src && jar -cmfv MANIFEST.mf XPlaneConnection.jar *.class
	cd src && printf "Main-Class: XPlaneConnection\nClass-Path: XPC-1.3.RC5.jar $(DAIDALUS_JAR)\n" > MANIFEST-REPLAY.MF
	cd src && jar -cmfv MANIFEST-REPLAY.mf XPlaneConnectionReplay.jar *.class
	mv src/*.jar dist/
	@make remove-xplane-connection-class-files

xpc:
	@if [ ! -e "dist" ]; then \
		mkdir dist; \
	fi
	cd src/XPC && javac gov/nasa/xpc/*.java && javac gov/nasa/xpc/discovery/*.java
	cd src/XPC && jar -cfv XPC-1.3.RC5.jar * && mv *.jar ../../dist
	@make remove-xpc-class-files

clean: remove-xpc-class-files remove-xplane-connection-class-files
	@if [ -e "dist" ]; then \
		rm -rf dist;\
	fi

remove-xplane-connection-class-files:
	@-rm src/*.class

remove-xpc-class-files:
	@-rm src/XPC/gov/nasa/xpc/*.class
	@-rm src/XPC/gov/nasa/xpc/discovery/*.class