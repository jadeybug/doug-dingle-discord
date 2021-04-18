//@ts-check

'use-strict'

const { Client, ClientUser } = require('discord.js')
import wiki from 'wikipedia' 
import Config from './config.js' 
import Markov from 'markov-strings'
import Page from 'wikipedia/dist/page'

/**
 * @type {{
 *  autoSuggest: boolean,
 *  preload: boolean,
 *  fields: Array<import('wikipedia/dist/optionTypes').pageFunctions>
 * }}
 */
const wikiPageOptions = {
	autoSuggest: true,
	preload: true,
	fields: [
		"content",
		"images",
		"links",
	]
}

const client = new Client();

const markov = new Markov({
	stateSize:3
})

const addImages = (images) => {
	console.log(images)
}

/**
 * @param {string} content 
 */
const addContent = (content) => {
	if (content.length > 0){
		markov.addData(content.replaceAll("\n", "").split(/\. |\./).map(sentence => ({ string: sentence+"." })).filter(string => string.string.length > 3))
	}
}

/**
 * @param {string[]} links 
 * @param {number} numberOfLinks
 * @returns {Promise<Promise<Page>[]>}
 */
const getLinks = (links, numberOfLinks) => {
	return new Promise((resolve, reject) => {
		let mockLinkArray = []
		for (let i=0; i<numberOfLinks; i++) {
			mockLinkArray.push(i)
		}
		resolve(mockLinkArray.map(() => {
			const link = links[Math.floor(Math.random() * links.length)]
			return getPage(link)
		}))
	})
}

/**
 * @param {string[]} links , images: import('wikipedia/dist/resultTypes').imageResult[], content: string]} contentChunk 
 * @returns {Promise<boolean>}
 */
const addLinks = (links) => {
	return new Promise((resolve, reject) => {
		/** 
		 * TODO: variable distraction levels (chooses more or fewer links)
		 **/
		let randoCommando = Math.floor(Math.random() * 10)
		const numberOfLinks = randoCommando <= links.length ? randoCommando : links.length
		getLinks(links, numberOfLinks)
		.then(chosenLinks => {
			Promise.all(chosenLinks)
			.then(pages => {
				const linkPromises = []
				pages.forEach(page => {
					linkPromises.push(page.content().then(addContent))
					linkPromises.push(page.images().then(addImages))
				})
				Promise.all(linkPromises)
				.then(() => resolve(true))
				.catch((e) => reject(e))
			})
			.catch(e => reject(e))
		})			
	})
}

/**
 * 
 * @param {string} query 
 * @param {number} iteration 
 * @returns {Promise<Page>}
 */
const getPage = (query, iteration=0) => {
	return new Promise((resolve, reject) => {
		wiki.page(query, wikiPageOptions)
		.then(page => resolve(page))
		.catch(() => {
			wiki.search(query, {
				suggestion: true,
			})
			.then(response => {
				let pageTitle = ""
				if (response.results.length === 0) {
					pageTitle = response.suggestion
				} else {
					pageTitle = response.results[iteration]?.title
				}
				getPage(pageTitle, iteration+1)
				.then(resolve)
				.catch(() => reject('Your premise is flawed.'))
			})
		})
	})
}

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
	if (msg.mentions?.users?.find(usr => usr.id === client.user.id)) {
		const query = msg.content.substr(msg.content.indexOf("<@"+client.user.id+">") + client.user.id.length + 3).trim()
		getPage(query)
		.then(page => {
			return new Promise((resolve, reject) => {
				Promise.all([
					page.links().then(addLinks),
					page.content().then(addContent),
					page.images().then(addImages),
					console.log(page.contentmodel)
				])
				.then(() => resolve(true))
				.catch((e) => reject(e))
			})
		})
		.then(() => {
			try{
				const knowledge = markov.generate({
					maxTries:1000,
					filter: result => result.score > 0 && result.string.endsWith(".") && result.refs.length > 2
				})
				msg.channel.send(knowledge.string.substring(0, 2000))
			} catch (e) {
				msg.channel.send("It's just such an advanced topic that I can't really put it into words that you'll understand.")
				console.log(e)
			}
		})
		.catch((e) => {
			msg.channel.send(e)
			console.error(e)
		})
	}
});

client.login(Config.key);