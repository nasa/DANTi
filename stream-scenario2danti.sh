#!/bin/bash
# make stream-scenario2danti
# available options:
#   speed N (simulation speed, where N is an integer, e.g., real time (1), fast-time (2), slow-time (0.5))
#   animate (creates additional frames, useful during replay to create smoother simulations)
#   loop (loop simulation)
node dist/danti-connect/stream-scenario2danti.js $@