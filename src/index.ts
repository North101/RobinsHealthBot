import * as Discord from 'discord.js';

export default class RobinsHealthBot {
    command: string;
    minPlayers = 2;
    maxPlayers = 5;

    bot: Discord.Client;
    activeChannels: Map<string, Map<string, number>>;

    constructor(
        token: string,
        command: string = '!health',
        avatar: string | null = null,
        minPlayers = 2,
        maxPlayers = 5,
    ) {
        this.command = command;
        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;

        this.bot = new Discord.Client();
        this.activeChannels = new Map();

        this.bot.on('ready', () => {
            console.log('Connected');
            console.log(`Logged in as: ${this.bot.user?.username} (${this.bot.user?.id})`);

            this.bot.user!.setActivity({
                name: this.command,
                type: 'LISTENING',
            });
        });
        this.bot.on('message', (message) => {
            if (message.author.bot) return;

            const args = message.content.split(/\s+/);
            if (message.channel.type === 'dm') {
                return this.handle(message, args);
            } else if (message.channel.type === 'text') {
                switch (args[0]) {
                    case this.command:
                    case `<@${this.bot.user?.id}>`:
                    case `<@!${this.bot.user?.id}>`: {
                        console.log(args[0]);
                        return this.handle(message, args.splice(1));
                    }
                }
            }
        });
        this.bot.login(token);
    }

    isUserMention = (mention: string) => {
        return mention.startsWith('<@') && mention.endsWith('>');
    }

    parseUserMention = (mention: string) => {
        let playerID = mention.slice(2, -1);
        if (playerID.startsWith('!')) {
            return playerID.slice(1);
        }
        return playerID;
    }

    handle = (message: Discord.Message, args: string[]) => {
        console.log(`handle ${args[0]}`);
        switch (args[0]) {
            case 'start':
                return this.handleStart(message, args.splice(1));
            case 'stop':
                return this.handleStop(message, args.splice(1));
            case 'inc':
                return this.handleHealthChange(message, args.splice(1), 'inc');
            case 'dec':
                return this.handleHealthChange(message, args.splice(1), 'dec');
            case 'show':
                return this.sendHealth(message);
            case 'help':
                this.handleHelp(message, args.splice(1));
                message.react('👍');
                return;
            default:
                message.channel.send(`Unknown command: ${args[0]}`);
                message.react('👎');
                return this.handleHelp(message, args.splice(1));
        }
    }

    handleStart = (message: Discord.Message, args: string[]) => {
        const channelPlayers = this.activeChannels.get(message.channel.id);
        if (channelPlayers !== undefined) {
            this.sendChannelAlreadyStarted(message);
            return;
        } else if (args.length < 2) {
            this.sendNotEnoughArguments(message);
            return;
        }

        const playerIDs = new Set<string>();
        const healthArg = args.pop()!;
        for (const playerArg of args.values()) {
            console.log(`playerArg = ${playerArg}`);
            if (playerArg === 'me') {
                console.log(`${playerArg} = ${message.author.id}`);
                playerIDs.add(message.author.id);
            } else if (this.isUserMention(playerArg)) {
                const playerID = this.parseUserMention(playerArg);
                console.log(`${playerArg} = ${playerID}`);
                if (message.client.users.resolveID(playerID)) {
                    playerIDs.add(playerID);
                } else {
                    this.sendUnknownPlayer(message, playerArg);
                    return;
                }
            } else {
                this.sendUnknownPlayer(message, playerArg);
                return;
            }
        }

        if (playerIDs.size < this.minPlayers) {
            this.sendMinPlayers(message);
            return;
        } else if (playerIDs.size > this.maxPlayers) {
            this.sendMaxPlayers(message);
            return;
        }

        const health = parseInt(healthArg);
        if (isNaN(health)) {
            this.sendNotAValidNumber(message, healthArg)
            return;
        } else if (health <= 0) {
            this.sendHealthLt0(message, health);
            return;
        }

        this.activeChannels.set(message.channel.id, Array.from(playerIDs).reduce((result, item) => {
            result.set(item, health);
            return result;
        }, new Map<string, number>()));

        this.sendHealth(message);
        message.react('👍');
    }

    handleStop = (message: Discord.Message, args: string[]) => {
        const channelPlayers = this.activeChannels.get(message.channel.id);
        if (channelPlayers === undefined) {
            this.sendChannelNotStarted(message);
            return;
        }

        this.sendHealth(message);

        this.activeChannels.delete(message.channel.id);

        message.channel.send(`Stopped`);
        message.react('👍');
    }

    handleHealthChange = (message: Discord.Message, args: string[], change: 'inc' | 'dec') => {
        const channelPlayers = this.activeChannels.get(message.channel.id);
        if (channelPlayers === undefined) {
            this.sendChannelNotStarted(message);
            return;
        } else if (!channelPlayers.has(message.author.id)) {
            this.sendNotAPlayer(message);
            return
        } else if (args.length < 2) {
            this.sendNotEnoughArguments(message);
            return;
        }

        const players = new Set<string>();
        const healthArg = args.pop()!;
        for (const playerArg of args.values()) {
            if (playerArg === 'me') {
                players.add(message.author.id);
            } else if (playerArg === 'all') {
                for (const otherPlayer of channelPlayers.keys()) {
                    players.add(otherPlayer);
                }
            } else if (playerArg === 'others') {
                for (const otherPlayer of [...channelPlayers.keys()].filter((p) => p !== message.author.id)) {
                    players.add(otherPlayer);
                }
            } else if (this.isUserMention(playerArg)) {
                const playerID = this.parseUserMention(playerArg);
                console.log(`${playerArg} = ${playerID}`);
                if (this.bot.users.resolveID(playerID)) {
                    players.add(playerID);
                } else {
                    this.sendUnknownPlayer(message, playerArg);
                    return;
                }
            } else {
                this.sendUnknownPlayer(message, playerArg);
                return;
            }
        }

        const health = parseInt(healthArg);
        if (isNaN(health)) {
            this.sendNotAValidNumber(message, healthArg)
            return;
        } else if (health <= 0) {
            this.sendHealthLt0(message, health);
            return;
        }

        if (players.size === 0) {
            this.sendNoPlayersSelected(message);
            return;
        }

        for (const player of players.values()) {
            channelPlayers.set(player, (channelPlayers.get(player) ?? 0) + (change === 'inc' ? health : -health));
        }
        this.sendHealth(message);
        message.react('👍');
    }

    handleHelp = (message: Discord.Message, args: string[]) => {
        message.channel.send([
            'Commands:',
            `${this.command} start @player1 @player2 <health>`,
            `${this.command} stop`,
            `${this.command} inc @player me all others <health>`,
            `${this.command} dec @player me all others <health>`,
            `${this.command} health`,
            `${this.command} help`,
        ].join('\n'));
    }

    sendChannelAlreadyStarted = (message: Discord.Message) => {
        message.channel.send(`Health tracking already in progress`);
        message.react('👎');
    }

    sendChannelNotStarted = (message: Discord.Message) => {
        message.channel.send(`Health tracking is not in progress`);
        message.react('👎');
    }

    sendHealth = (message: Discord.Message) => {
        const channelPlayers = this.activeChannels.get(message.channel.id)!;

        message.channel.send([
            'Player Health:',
            ...[...channelPlayers.entries()].map(([playerID, health]) => {
                return `<@${playerID}>: ${health}🩸`;
            }),
        ].join('\n'));
    }

    sendNotEnoughArguments = (message: Discord.Message) => {
        message.channel.send(`There are not enough arguments for this command`);
        message.react('👎');
    }

    sendNotAPlayer = (message: Discord.Message) => {
        message.channel.send(`You are not a player`);
        message.react('👎');
    }

    sendUnknownPlayer = (message: Discord.Message, player: string) => {
        message.channel.send(`Unknown player ${player}`);
        message.react('👎');
    }

    sendMinPlayers = (message: Discord.Message) => {
        message.channel.send(`Must have more than ${this.minPlayers} activeChannels`);
        message.react('👎');
    }

    sendMaxPlayers = (message: Discord.Message) => {
        message.channel.send(`Must have less than ${this.maxPlayers} activeChannels`);
        message.react('👎');
    }

    sendNoPlayersSelected = (message: Discord.Message) => {
        message.channel.send(`No activeChannels selected`);
        message.react('👎');
    }

    sendNotAValidNumber = (message: Discord.Message, healthArg: string) => {
        message.channel.send(`${healthArg} is not a valid number`);
        message.react('👎');
    }

    sendHealthLt0 = (message: Discord.Message, health: number) => {
        message.channel.send(`${health} must be > 0`);
        message.react('👎');
    }
}