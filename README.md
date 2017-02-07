# Landsat on AWS

The [landsatonaws.com](https://landsatonaws.com) website is serverless, lightweight, fast, and infinitely scalable. It is designed to display data from the [Landsat on AWS](https://aws.amazon.com/public-data-sets/landsat/) public data set and uses [AWS Lambda](https://aws.amazon.com/lambda/), and [Amazon API Gateway](https://aws.amazon.com/api-gateway/) to dynamically generate pages on the fly for hundreds of thousands of images.


## Goals of this project

- **Fast.** Pages should load quickly.
- **Lightweight.** Hosting 100,000,000 pages should cost less than $100 per month.
- **Indexable.** All path/row pages of the site should be indexable by search engines.
- **Linkable.** All unique pages of the site should have a [cool URI](http://www.w3.org/Provider/Style/URI.html).

### What this project is good for

- Making Landsat imagery discoverable via search engines.
- Allowing people to use an easy [WRS path/row](http://landsat.gsfc.nasa.gov/?p=3231) combination and find basic information about which scenes are available and the cloud cover percentage.
- Demonstrating how scalable websites can be built based on structured data.

### What this project is _not_ good for

- Finding Landsat data based on queries other than WRS path/row combinations.
- Analyzing Landsat data.

## Structure

The project structure is a slightly modified version of the [serverless-starter](https://github.com/serverless/serverless-starter) project. Because we're returning HTML views instead of JSON, there is also a `restApi/views` directory that contains HTML templates rendered dynamically at request time, based on query inputs.

The project relies on dynamically generating HTML output using Lambda functions at request time (requests handled by API Gateway). An updater runs throughout the day to check the latest files in the `landsat-pds` S3 bucket and creates a small number of underlying data files that get stored on S3. These files are requested by Lambda functions as needed, before HTML is returned. This means that we are only serving content-full (as opposed to using JavaScript to load data within the page itself) from API Gateway, which makes indexing easier. This also means that outside of our small set of data files, we are not storing anything to present the hundreds of thousands of pages needed to reflect the underlying Landsat imagery.

## To run

1. Download [Node.js](https://nodejs.org/download/) and install it.
2. Clone or download this repository and go into the project folder.
3. Install [serverless](http://serverless.com/) globally: `npm install -g serverless`
4. Install package dependencies: `npm install`
5. Init the serverless project and follow the prompts: `sls project init`
6. Deploy the client and take note of the S3 bucket URL returned (this  deploys some static assets to S3): `sls client deploy`
7. The first time you run it, you  need to add two properties to the newly created `_meta/s-variables-common.json` file:
>* `baseURL` is the base URL of the website (this goes into creating the sitemap; if you don't care about that, go ahead and leave this blank)
>* `staticURL` is the URL of the S3 bucket for static assets (you see the bucket after running `sls client deploy`)

This should look something like the following (make sure the format matches and includes 'https' and a trailing slash'; keep in mind `us-east-1` just used `s3.amazonaws.com/foo`).
>>```
>>"baseURL": "https://landsatonaws.com/",
>>"staticURL": "https://s3-us-west-2.amazonaws.com/foo-dev-us-west-2/"
>>```

## To deploy
Deploy all the functions and endpoints one time. From then on, you can just deploy as you make changes to individual files. There are a number of different ways to deploy with Serverless (see the  [Serverless Framework documentation](https://serverless.com/framework/docs/))

1. To deploy all, try `sls dash deploy`, select everything, and deploy.
2. Run the `landsat-updater` function one time to build up some required static files on S3: `sls function run landsat-updater -d`

>**Note** If you're just testing, you don't need to deploy the `landsat-updater` *event*, which runs periodically to keep files up to date.

After you've deployed everything, you should see a URL to your endpoints to test out. You only need to deploy again when you make changes to files.

`sls client deploy` currently overwrites other files when deploying, which removes the data files created by running `landsat-updater`. To work around this, you can either rerun `landsat-updater` after each deployment of static assets, or you can deploy assets manually by running something like the following:
    `aws s3 cp client/dist/assets s3://landsatonaws.com-dev-us-west-2/assets --recursive`

## Points of Interest
You can also optionally show points of interest data for each Landsat scene. This data is pulled from [OpenStreetMap](https://www.openstreetmap.org/) and uses Mapbox's [OSM QA Tiles](http://osmlab.github.io/osm-qa-tiles/) project. To generate these files, download the latest planet file, run `node index.js --source latest-planet.mbtiles --map map.js` and upload generated files with a key prefix of `poi/` to your Amazon S3 bucket for the project. Currently, national parks, cities/states/countries and monuments are being pulled from OSM data. You can change this in the `poi/map.js` file.