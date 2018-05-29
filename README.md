# Tecendil Backend

The backend component of Tecendil which provides dictionary definitions.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)

## Running Locally

Make sure you have [Node.js](http://nodejs.org/) and the [Heroku Toolbelt](https://toolbelt.heroku.com/) installed.

```sh
# $ git clone git@github.com:heroku/node-js-getting-started.git # or clone your own fork
$ cd tengwar
$ npm install
$ npm start
```

The app should now be running on [localhost:5000](http://localhost:5000/).

## Deploying to Heroku

```sh
$ heroku create
$ git push heroku master
$ heroku open
```

## API
```
/define/:word
```

Returns a JSON record containing an array of entries matching the specified word.

