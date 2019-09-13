#!/usr/bin/python
# deploy.py

# Import statements
import os
import json
import yaml
import argparse
import subprocess
from dotenv import dotenv_values


# Constants
TEMPLATE = "serverless.yml"
PARTIAL_TEMPLATE = "serverless_partial.json"

DOT_ENV = ".env"

PRV = "provider"
ENV = "environment"
SAMPLE_VAL = "variable1"

APP_ID = "APP_ID"
PRIVATE_KEY = "PRIVATE_KEY"
WEBHOOK_SECRET = "WEBHOOK_SECRET"
TRAVIS_AUTH = "TRAVIS_AUTH"

DEPLOYMENT = "Deployment Script:"


# Creates the full serverless.yml template
def create_full_template():
    log("Creating 'serverless.yml'...")

    # Read the .env
    secrets = dotenv_values(stream=DOT_ENV)

    log("Reading secrets from '.env'...")

    data = None
    with open(PARTIAL_TEMPLATE, "r") as data_file:
        data = json.load(data_file)

    log("Reading in partial template...")

    # Remove the sample data
    data[PRV][ENV].pop(SAMPLE_VAL)
    data[PRV][ENV][APP_ID] = secrets[APP_ID]
    data[PRV][ENV][PRIVATE_KEY] = secrets[PRIVATE_KEY]
    data[PRV][ENV][WEBHOOK_SECRET] = secrets[WEBHOOK_SECRET]
    data[PRV][ENV][TRAVIS_AUTH] = secrets[TRAVIS_AUTH]

    log("Writing full 'serverless.yml' template...")

    with open(TEMPLATE, "w") as data_file:
        yaml.dump(data, data_file, default_flow_style=False)


# Deploys the stack to AWS
def deploy_to_aws():

    log("Calling 'serverless' to deploy stack...")

    process = subprocess.Popen(
        ["serverless", "deploy", "-v"],
        stdout=subprocess.PIPE,
        shell=True
    )

    # Show the output as it happens
    while True:
        output = process.stdout.readline().decode()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.strip())
    process.poll()

    log("Removing template file...")

    # Cleanup
    os.remove(TEMPLATE)


# Removes the existing AWS
def remove_from_aws():
    log("Calling 'serverless' to remove existing stack...")

    process = subprocess.Popen(
        ["serverless", "remove", "-v"],
        stdout=subprocess.PIPE,
        shell=True
    )

    # Show the output as it happens
    while True:
        output = process.stdout.readline().decode()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.strip())
    process.poll()

    log("Removing template file...")

    # Cleanup
    os.remove(TEMPLATE)



# Logs data to stdout
def log(text):
    print("{} {}".format(DEPLOYMENT, text))



# Main routine
def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--remove-stack",
        help="Removes the existing AWS CloudFormation stack.",
        default=False,
        action='store_true'
    )
    parser.add_argument(
        "-d",
        "--dry",
        help="Outputs the 'serverless.yml' template and exits \
         (useful for running serverless commands).",
        default=False,
        action='store_true'
    )
    args = parser.parse_args()

    create_full_template()
    if not args.dry:
        if not args.remove_stack:
            deploy_to_aws()
        else:
            remove_from_aws()

    log("Done!")


# Main method
if __name__ == "__main__":
    main()
