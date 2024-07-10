SHELL=/bin/bash

address="0.0.0.0"
submodules=submodules
DAIDALUS_VERSION=2.0.4
DAIDALUS_JAR:=DAIDALUSv$(DAIDALUS_VERSION).jar

all:
	@echo -e "\033[0;32m** Building DANTi Display... **\033[0m"
	make install
	make daa-displays
	make xplane
	make gdl90
	make dist
	make help

gdl90:
	@echo -e "\033[0;32m** Building GDL90 Module... **\033[0m"
	cd src/danti-connect/gdl90 && make
	@echo -e "\033[0;32m** Done with building GDL90! **\033[0m"
	@echo -e "\033[0;32m** - To start the GDL90 receiver, type \033[0mmake run-gdl90\033[0;32m at the command prompt **\033[0m"
	@echo -e "\033[0;32m** - To stream sample data to the GDL90 receiver, type \033[0mmake stream-gdl90\033[0;32m at the command prompt **\033[0m"

run-gdl90:
	cd src/danti-connect/gdl90 && ./gdl90-udp

stream-gdl90:
	node dist/danti-connect/gdl90-source.js

arch:
	arch -x86_64 zsh

help:
	@echo -e "\033[0;32m** Use instructions **\033[0m"
	@echo -e "\033[0;32m - To run DANTi, type \033[0mnpm start\033[0;32m at the command prompt\033[0m"
	@echo -e "\033[0;32m - To run DANTi and the GDL-90 module, type \033[0mnpm run danti-gdl90\033[0;32m at the command prompt\033[0m"
	@echo -e "\033[0;32m - To connect X-Plane to DANTi: \033[0mnpm run connect-xplane2danti\033"
	@echo -e "\033[0;32m - To stream a scenario to X-Plane: \033[0mnpm run stream-scenario2xplane\033"
	@echo -e "\033[0;32m - To stream a scenario directly to DANTi: \033[0mnpm run stream-scenario2danti\033"

install:
	@echo -e "\033[0;32m** Installing dependencies **\033[0m"
	npm install
	@echo -e "\033[0;32m** Done with installing dependencies! **\033[0m"

tsc-nocopy:
	@echo -e "\033[0;32m** Compiling typescript code **\033[0m"
	npm run tsc
	@echo -e "\033[0;32m** Done with compiling typescript code! **\033[0m"

tsc:
	@echo -e "\033[0;32m** Compiling typescript code **\033[0m"
	npm run tsc
	make copy
	@echo -e "\033[0;32m** Done with compiling typescript code! **\033[0m"

xplane:
	@if [ ! -f "src/danti-utils/lib/$(DAIDALUS_JAR)" ]; then \
		rm src/danti-utils/lib; \
		cd src/danti-utils && ln -s ../../$(submodules)/daa-displays/daidalus-submodules/v$(DAIDALUS_VERSION)/Java/lib lib; \
	fi
	cd src/danti-connect/xplane && make DAIDALUS_VERSION=$(DAIDALUS_VERSION)
	@if [ ! -e "dist" ]; then \
		mkdir dist; \
	fi
	@if [ ! -e "dist/danti-connect" ]; then \
		mkdir dist/danti-connect; \
	fi
	@if [ ! -e "dist/danti-connect/xplane" ]; then \
		mkdir dist/danti-connect/xplane; \
	fi
	-rsync -a src/danti-connect/xplane/dist dist/danti-connect/xplane

testbed:
	cd src/danti-connect/testbed && make
	@if [ ! -e "dist/danti-connect/testbed" ]; then \
		mkdir dist/danti-connect/testbed; \
	fi
	@if [ ! -e "dist/danti-connect/testbed/x86_64.win64" ]; then \
		mkdir dist/danti-connect/testbed/x86_64.win64; \
	fi
	@if [ ! -e "dist/danti-connect/testbed/x86_64.win64/DantiDccmClient" ]; then \
		mkdir dist/danti-connect/testbed/x86_64.win64/DantiDccmClient; \
	fi
	@if [ ! -e "dist/danti-connect/testbed/x86_64.win64/DantiSmartNasCommClient" ]; then \
		mkdir dist/danti-connect/testbed/x86_64.win64/DantiSmartNasCommClient; \
	fi
	@if [ ! -e "dist/danti-connect/testbed/x86_64.win64/DantiSmartNasCommClient/dist" ]; then \
		mkdir dist/danti-connect/testbed/x86_64.win64/DantiSmartNasCommClient/dist; \
	fi
	-rsync -a src/danti-connect/testbed/x86_64.win64/DantiDccmClient/dist/*.jar dist/danti-connect/testbed/x86_64.win64/DantiDccmClient
	-rsync -a src/danti-connect/testbed/x86_64.win64/DantiSmartNasCommClient/dist/*.jar dist/danti-connect/testbed/x86_64.win64/DantiSmartNasCommClient/dist
	-rsync -a src/danti-connect/testbed/x86_64.win64/scripts dist/danti-connect/testbed/x86_64.win64/

daa-displays:
	@echo -e "\033[0;32m** Making daa-displays submodule **\033[0m"
	git submodule update --init --remote
	@echo -e "\033[0;32m** Done with cloning daa-displays! **\033[0m"
	@echo -e "\033[0;32m** Building daa-displays **\033[0m"
	@cd $(submodules)/daa-displays && make -e daidalus-releases=v$(DAIDALUS_VERSION) -e only-danti=y
	@echo -e "\033[0;32m** Done with making daa-display! **\033[0m"
	# copying files and folders to dist
	@if [ ! -e "dist" ]; then \
		mkdir dist; \
	fi
	rsync -a $(submodules)/daa-displays/dist/daa-logic/ dist/daa-logic
	rsync -a $(submodules)/daa-displays/dist/daa-scenarios/ dist/daa-scenarios
	rsync -a $(submodules)/daa-displays/dist/daa-config/* dist/daa-config
	rsync -a $(submodules)/daa-displays/dist/aeronav/ dist/aeronav
	@if [ ! -e "dist/daa-displays" ]; then \
		mkdir dist/daa-displays; \
	fi
	rsync -a $(submodules)/daa-displays/dist/daa-displays/sounds/ dist/daa-displays/sounds
	@if [ ! -e "dist/daa-output" ]; then \
		mkdir dist/daa-output; \
	fi	
	# removing unnecessary files...
	-rm -rf dist/daa-config/1.x
	-rm dist/daa-config/2.x/Buffered*.conf
	-rm dist/daa-config/2.x/CD3D.conf
	-rm dist/daa-config/2.x/TCAS3D.conf
	-rm dist/daa-config/2.x/DO_*.conf
	@echo -e "\033[0;32m** Done with daa-displays! **\033[0m"

copy:
	# creating directory structure
	@if [ ! -e "dist" ]; then \
		mkdir dist; \
	fi
	@if [ ! -e "dist/danti-utils" ]; then \
		mkdir dist/danti-utils; \
	fi
	@if [ ! -e "dist/danti-utils/lib" ]; then \
		cd dist/danti-utils && ln -s ../../$(submodules)/daa-displays/daidalus-submodules/v$(DAIDALUS_VERSION)/Java/lib/ lib; \
	fi
	@if [ ! -e "dist/daa-output" ]; then \
		mkdir dist/daa-output; \
	fi
	@if [ ! -e "dist/daa-scenarios" ]; then \
		mkdir dist/daa-scenarios; \
	fi
	@if [ ! -e "dist/danti-connect/gdl90" ]; then \
		mkdir -p dist/danti-connect/gdl90; \
	fi
	# copying files
	rsync -a src/daa-displays/svgs dist/daa-displays/
	rsync -a src/daa-displays/ColladaModels dist/daa-displays/
	rsync -a src/daa-displays/css dist/daa-displays/
	rsync -a src/daa-displays/images dist/daa-displays/
	rsync -a src/daa-displays/wwd dist/daa-displays/
	rsync -a src/tileServer dist/tile-server
	rsync -a src/danti-themes dist/
	rsync -a src/daa-scenarios/*.daa dist/daa-scenarios
	rsync -a $(submodules)/daa-displays/dist/daa-config dist/
	rsync src/*.html dist/
	rsync -a src/danti-connect/xplane/dist dist/danti-connect/xplane
	rsync -a src/danti-connect/gdl90/gdl90-udp dist/danti-connect/gdl90
	rsync node_modules/leaflet/dist/leaflet.js ./dist
	@if [ ! -e "dist/node_modules" ]; then \
		cd dist && ln -s ../node_modules node_modules; \
	fi

dist: tsc-nocopy
	@echo -e "\033[0;32m** Creating dist folder **\033[0m"
	make copy
	# building jar file DAABandsREPLV2.jar
	make copy-repl-modules
	cp src/danti-utils/*.class dist/danti-utils
	# selecting library $(DAIDALUS_JAR) for the manifest file
	cd src/danti-utils && printf "Main-Class: DAABandsREPLV2\nClass-Path: lib/$(DAIDALUS_JAR)\n" > MANIFEST.MF
	cp src/danti-utils/MANIFEST.MF dist/danti-utils
	cd dist/danti-utils && jar -cfm DAABandsREPLV2.jar ./MANIFEST.MF *.class && rm *.class && cd ../../..
	@touch dist/daa-output/REPL.json
	@touch dist/daa-scenarios/REPL-scenario.json
	make daa-displays
	cp package-dist.json dist/package.json && cp package-lock.json dist/
	rm dist/leaflet.js && cp node_modules/leaflet/dist/leaflet.js dist/
	@if [ ! -e "dist/danti-utils/lib/$(DAIDALUS_JAR)" ]; then \
		cp dist/daa-logic/$(DAIDALUS_JAR) dist/danti-utils/lib/; \
	fi
	@echo -e "\033[0;32m** Done with creating dist folder! **\033[0m"

start:
	# starting app
	npm run danti

pack:
	@echo -e "\033[0;32m** Generating Electron App... **\033[0m"
	-cd dist && rm node_modules
	npm run pack
	@echo -e "\033[0;32m** Done with generating Electron App at ./pack/mac/danti-display.app **\033[0m"

submodules-aux:
	@if [ ! -e "$(submodules)" ]; then \
		mkdir $(submodules); \
	fi
	@cd $(submodules) && git submodule update --init --remote
	@cd $(submodules)/daa-displays && make

submodules:
	@echo -e "\033[0;32m** Making submodules **\033[0m"
	@make submodules-aux
	@echo -e "\033[0;32m** Done with making submodules! **\033[0m"

repl-modules:
	make submodules-aux
	make copy-repl-modules

copy-repl-modules:
	@echo -e "\033[0;32m** Making DAIDALUS Read-Eval-Print (REPL) modules **\033[0m"
	@if [ ! -e "src/danti-utils/lib" ]; then \
		cd src/danti-utils && ln -s ../../$(submodules)/daa-displays/daidalus-submodules/v$(DAIDALUS_VERSION)/Java/lib/ lib; \
	fi
	rsync $(submodules)/daa-displays/src/daa-logic/utils/DAABandsV2.java src/danti-utils
	rsync $(submodules)/daa-displays/src/daa-logic/utils/DAAMonitorsV2.java src/danti-utils
	rsync $(submodules)/daa-displays/src/daa-logic/utils/DAA2Json.java src/danti-utils
	rsync $(submodules)/daa-displays/src/daa-logic/utils/DAAProfiler.java src/danti-utils
	cd src/danti-utils && javac -cp ./:./lib/$(DAIDALUS_JAR) DAABandsREPLV2.java && cd ../../../
	@echo -e "\033[0;32m** Done with making DAIDALUS REPL modules! **\033[0m"
	@echo -e "\033[0;32m** Use\033[0m make repl\033[0;32m to launch DAIDALUS REPL\033[0m"

repl:
	@cd dist && java -jar danti-utils/DAABandsREPLV2.jar

file="Centennial_N416DJ_own_m_short.daa"

# examples:
#   make stream-scenario2danti file=centennial
stream-scenario2danti:
	node dist/danti-connect/stream-scenario2danti.js $(file)

stream-scenario2danti-loop:
	node dist/danti-connect/stream-scenario2danti.js $(file) -- loop

stream-scenario2danti-la:
	node dist/danti-connect/stream-scenario2danti.js $(file) -- loop animate speed 16

stream-scenario2xplane:
	node dist/danti-connect/stream-scenario2xplane.js $(file)

stream-scenario2xplane-loop:
	node dist/danti-connect/stream-scenario2xplane.js $(file) -- loop

stream-scenario2xplane-la:
	node dist/danti-connect/stream-scenario2xplane.js $(file) -- loop animate speed 8

# run danti
run-danti:
	npm run danti

# examples:
#   make connect-testbed2danti
connect-testbed2danti:
	node dist/danti-connect/connect-testbed2danti.js

# xplane is always on localhost
# danti is on localhost by default
# examples:
#   make connect-xplane2danti address=192.168.0.1
connect-xplane2danti:
	node dist/danti-connect/connect-xplane2danti.js $(address)

# connect xplant to danti for a replay
connect-xplane2danti-replay:
	node dist/danti-connect/connect-xplane2danti.js $(address) -replay

# xplane is always on localhost
# examples:
#   make test-xplane-connection
test-xplane-connection:
	node dist/danti-connect/test-xplane-connection.js

test-xplane:
	cd src/danti-connect/xplane && ./test-xplane.sh

# examples:
#   make flight-plan file=centennial
flight-plan:
	@if [ $(file) ]; then \
		node dist/danti-connect/flight-plan.js $(file); \
	fi

config="DO_365B_no_SUM"

# examples:
#	make send config=DO_365B_no_SUM
send:
	@if [ $(config) ]; then \
		node dist/danti-connect/send-config.js $(config); \
	fi

audit:
	-npm audit fix

clean:
	@echo -e "\033[0;32m** Cleaning dist and dependency folders **\033[0m"
	-rm -rf node_modules
	-rm -rf dist
	-cd src/danti-utils && rm *.class
	-cd src/danti-connect/xplane && make clean
	-cd src/danti-connect/testbed && make clean
	@echo -e "\033[0;32m** Done with cleaning! **\033[0m"

ls-scenarios:
	ls dist/daa-scenarios/*.daa

ls-origin:
	git ls-remote --get-url origin

dir=""
xattr:
	xattr -d -r com.apple.quarantine $(dir)

eslint:
	npx eslint 'src/**/*.ts'

eslint-log:
	npx eslint 'src/**/*.ts' > eslint.log

eslint-fix:
	npx eslint --fix 'src/**/*.ts'

.PHONY: dist daa-displays pack gdl90
