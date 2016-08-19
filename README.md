# landsatonaws.com

landsatonaws.com is a serverless, lightweight, fast, and infinitely scalable website designed to display data from the [Landsat on AWS](https://aws.amazon.com/public-data-sets/landsat/) public data set. It uses [AWS Lambda](https://aws.amazon.com/lambda/), and [AWS API Gateway](https://aws.amazon.com/api-gateway/) to dynamically generate pages on the fly for hundreds of thousands of images.


## Goals of this project

- **Fast.** Pages should load quickly.
- **Lightweight.** Hosting 100,000,000 pages should cost less than $100 per month.
- **Indexable.** All path/row pages of the site should be indexable by search engines.
- **Linkable.** All unique pages of the site should have a [cool URI](http://www.w3.org/Provider/Style/URI.html)

### What this project is good for

- Making Landsat imagery discoverable via search engines.
- Allowing people who to easily use a [WRS path/row](http://landsat.gsfc.nasa.gov/?p=3231) combination to find basic information about which scenes are available and their cloud cover.
- Demonstrating how scalable websites can be built based on structured data.

### What this project _not_ good for

- Finding Landsat data based on queries other than WRS path/row combinations.
- Analyzing Landsat data.

## Structure

The project structure is a slightly modified version of the [serverless-starter](https://github.com/serverless/serverless-starter) project. Because we're returning HTML views instead of JSON, there is also a `restApi/views` directory which contains HTML templates that are rendered dynamically at request time, based on query inputs.

The project relies on dynamically generating HTML output using Lambda functions at request time (requests handled by API Gateway). An updater runs throughout the day to check the latest files in the `landsat-pds` S3 bucket and creates a small amount of underlying data files that get stored on S3. These files are requested by Lambda functions as needed, before HTML is returned. This means that we are only serving content-full (as opposed to using JavaScript to load data within the page itself) from API Gateway which makes indexing easier. This also means that outside of our small set of data files, we are not storing anything to present the hundreds of thousands of pages needed to reflect the underlying Landsat imagery.

## To run and deploy

1. Download Node.JS from https://nodejs.org/download/ and install it.

2. Clone or download this repository and go into project folder.

3. Install [serverless](http://serverless.com/) globally with `npm install -g serverless`.

4. Install package dependencies with `npm install`.

5. Init serverless project with `sls project init` and follow prompts.

6. Run `sls client deploy` and take note of the S3 bucket URL returned (this will deploy some static assets to S3).

7. First time only, you will need to add two properties to the newly created `_meta/s-variables-common.json` file. The `baseURL` is the base URL of the website (this goes into creating the sitemap, if you don't care about that, go ahead and leave blank), `staticURL` is the URL of the S3 bucket for static assets (you'll see the bucket after you run `sls client deploy`). This should look something like below (make sure format matches below and includes https and trailing slash and keep in mind `us-east-1` just used `s3.amazonaws.com/foo`).
>```
>"baseURL": "https://landsatonaws.com/",
>"staticURL": "https://s3-us-west-2.amazonaws.com/foo-dev-us-west-2/"
>```

8. Deploy all the functions and endpoints once. From then on out, you can just deploy as you make changes to individual files. There are a number of different ways to deploy with serverless (refer to [documentation](http://docs.serverless.com/v0.5.0/docs)), but to deploy all try `sls dash deploy`, select everything and deploy. **Note, that if you're just testing, you don't need to deploy the `landsat-updater` *event* which will run periodically to keep files up to date.

9. Run the `landsat-updater` function once to build up some required static files on S3 with `sls function run landsat-updater -d`.

10. Once you've deployed everything, you should see in the console a URL to your endpoints to test out. You'll only need to make new deploys when you make changes to files.

`sls client deploy` currently overwrites other files when deploying, which removes the data files created by running `landsat-updater`. To work around this, you can either rerun `landsat-updater` after each deploy of static assets, or you can deploy assets manually by doing something like `aws s3 cp client/dist/assets s3://landsatonaws.com-dev-us-west-2/assets --recursive`.