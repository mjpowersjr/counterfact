FROM node:20-alpine

RUN npm install -g counterfact

ADD --chown=node:node . /usr/local/lib/node_modules/counterfact

RUN mkdir /app && chown node:node /app

USER node
WORKDIR /app

# TODO: remove this once counterfact allows for a custom cache directory
RUN mkdir /app/code/ 

ENTRYPOINT [ "counterfact" ]

