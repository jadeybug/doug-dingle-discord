//@ts-check

import { Client } from 'discord.js'
import MarkovPkg from 'markov-strings'
// @ts-ignore
const Markov = MarkovPkg.default
import wikijsPkg from 'wikijs'
// @ts-ignore
const wikijs = wikijsPkg.default
import RandomInteger from 'random-int'
import RandomItem from 'random-item'

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

const allImages = {
	links: []
}

/**
 * 
 * @param {string[]} images 
 */
const addImages = (images) => {
	allImages.links.push(...images)
}

/** Which wikipedia page sections should not be included in the corpus? */
const excludedSections = [
	"See also",
	"References",
	"External links",
]

/**
 * @param {import('wikijs').Content[]} content 
 */
const addContent = (content) => {
	if (content.length > 0){
		// markov.addData(content.replaceAll("\n", "").split(/\. |\./).map(sentence => ({ string: sentence+"." })).filter(string => string.string.length > 3))
		const markovContent = content.filter(section => (
			!excludedSections.includes(section.title)
		)).reduce((reducedContent, currentSection) => {
			if (!!currentSection?.content && currentSection?.content?.length > 0) {
				const parsedContent = currentSection?.content?.replace(/\n/g, "")
					.split(/\. |\./)
					.map(sentence => ({
						title: currentSection.title,
						string: sentence+".",
					}))
					.filter(mappedContent => mappedContent.string.length > 3)
				if (!!parsedContent) {
					return [
						...reducedContent,
						...parsedContent,
					]
				} else {
					return reducedContent
				}
			} else {
				if (!!currentSection?.items && currentSection?.items?.length > 0 && !!currentSection?.items[0]?.content) {
					addContent(currentSection?.items)
				}
				return reducedContent
			}
		}, [])
		try {
			if (!!markovContent && markovContent.length > 0) {
				markov.addData(markovContent)
			}
		} catch(e) {
			console.log(e)
		}
		
	}
}

/**
 * @param {string[]} links 
 * @returns {Promise<Promise<import('wikijs').Page>[]>}
 */
const getLinks = (links) => {
	return new Promise((resolve, reject) => {
		resolve(RandomItem.multiple(links, RandomInteger(5, 20)).map(link => {
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
		getLinks(links)
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

const wikiOptions = {headers: {
	"User-Agent": "DougDingleKnowItAllDiscordBot/0.0 (jdmcg81+wikibot@gmail.com)"
}}
/**
 * 
 * @param {string} query 
 * @param {number} iteration 
 * @returns {Promise<import('wikijs').Page>}
 */
const getPage = (query, iteration=0) => {
	return new Promise((resolve, reject) => {
		wikijs(wikiOptions).find(query)
		.then(resolve)
		.catch(() => wikijs(wikiOptions).random(1).then(([randoPage]) => getPage(randoPage)))
		.catch(() => reject('Your premise is flawed.'))
	})
}

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
	if (msg.mentions?.users?.find(usr => usr.id === client.user.id)) {
		msg.channel.startTyping()
		const query = msg.content.substr(msg.content.indexOf("<@"+client.user.id+">") + client.user.id.length + 3).trim()
		getPage(query)
		.then(page => {
			return new Promise((resolve, reject) => {
				Promise.all([
					page.links().then(addLinks),
					page.content().then(addContent),
					page.images().then(addImages),
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
				msg.channel.stopTyping()
				msg.channel.send(knowledge.string.substring(0, 2000))
			} catch (e) {
				msg.channel.stopTyping()
				msg.channel.send("It's just such an advanced topic that I can't really put it into words that you'll understand.")
				console.error(e)
			}
		})
		.catch((e) => {
			msg.channel.stopTyping()
			msg.channel.send("I just can't even right now.")
			console.error(e)
		})
	}
});
client.login(process.env.DISCORD_KEY);