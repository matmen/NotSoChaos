#!/bin/bash

while true; do
		git reset --hard		#
		git pull origin master	# Make sure the local copy is up-to-date
		./migrate.sh			#

		./updater/run.sh

		for second in {10..1}
		do
			echo -ne "Restarting in $second seconds..\r"
			sleep 1
		done

done
