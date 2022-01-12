# Tecendil Backend

The backend component of Tecendil which provides dictionary definitions.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)

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
# $ git clone git@github.com:heroku/node-js-getting-started.git
# or clone your own fork
cd tecendil-backend
npm install
npm start
```

The app should now be running on [localhost:39999](http://localhost:39999/).

Try

- `http://localhost:39999/define/gandalf`
- `http://localhost:39999/define/nolofinwe`

## Deploying to Heroku

```sh
$ heroku create
$ git push heroku master
$ heroku open
```
