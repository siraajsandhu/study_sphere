#!/bin/bash

# DO NOT PUSH THIS FILE TO GITHUB
# This file contains sensitive information and should be kept private

# TODO: Set your PostgreSQL URI - Use the External Database URL from the Render dashboard
PG_URI="postgresql://users_db_29s1_user:vPBr30fndcNAnFtbd5NPgN1rMitmUhxs@dpg-csvobid2ng1s73du6peg-a.oregon-postgres.render.com/users_db_29s1"

# Execute each .sql file in the directory
for file in src/init_data/*.sql; do
    echo "Executing $file..."
    psql $PG_URI -f "$file"
done
cd z
