# Tecendil Backend

The backend component of Tecendil which provides dictionary definitions.

## API

```
/define/:word
```

Returns a JSON record containing an array of entries matching the specified word.

## Running Locally

Install:

- [Node.js](http://nodejs.org/)
- [Heroku Toolbelt](https://toolbelt.heroku.com/)

```sh
cd tecendil-backend
npm install
npm start
```

The app is running at [localhost:39999](http://localhost:39999/).

Try

- `http://localhost:39999/define/gandalf`
- `http://localhost:39999/define/nolofinwe`

## Updating Eldamo

- Delete the json file
- Update the XML file from https://github.com/pfstrack/eldamo/tree/master/src/data
- `npm start` to regenerate the JSON file

## Deploying

Deployment to Heroku is done automatically on push to master.

For manual deployment:

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)
