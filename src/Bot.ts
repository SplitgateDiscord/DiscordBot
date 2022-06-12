import { Client, ClientOptions, Collection, EmbedBuilder } from 'discord.js';
import { BotConfig, HandleFunction, BaseEmbedsOptions } from './types/Bot';
import { Logger } from '@schiacciata/logger';
import MongoClient from './util/MongoClient';
import { v2 } from 'splitgate.js';
import Command from './util/structures/Command';
import Event from './util/structures/Event';
import SlashCommand from './util/structures/SlashCommand';
import { readdirSync } from 'fs';
import { REST } from '@discordjs/rest';
import { ApplicationCommandType, Routes } from 'discord-api-types/v10';
import { colors, emojis } from './util/EmbedData';

class Bot extends Client {
    config: BotConfig;
    startDate: Date;
    isDev: boolean;
    restApi: REST;
    logger: Logger;
    mongo: MongoClient;
    splitgate: v2;
    commands: Collection<string, Command>;
    events: Collection<string, Event>;
    slashCommands: Collection<string, SlashCommand>;
    constructor(config: BotConfig, options: ClientOptions) {
        super(options);
        this.config = config;
        this.startDate = new Date();
        this.isDev = process.env.NODE_ENV === 'development';
        this.restApi = new REST({ version: '10' }).setToken(this.config.bot?.token || '');

        this.logger = new Logger(config.logger);
        this.mongo = new MongoClient(config.db, this);
        this.splitgate = new v2();

        this.commands = new Collection();
        this.events = new Collection();
        this.slashCommands = new Collection();
    }

    private async _loadHandlers(): Promise<void> {
        readdirSync(`${__dirname}/handlers`)
        .filter(file => file.endsWith('.js'))
        .forEach(async (handler) => {
            const { default: handle } = await import(`./handlers/${handler}`) as { default: HandleFunction };
            handle(this);
            this.logger.success(`Loaded handler: ${handler} ⚙️`);
        });
    }

    public async registerSlash() {
        try {
            const commands = Array.from(this.slashCommands.values())
            .map(cmd => ({
                name: cmd.name || '',
                description: cmd.description || '',
                options: cmd.options,
                type: cmd.type || ApplicationCommandType.ChatInput,
            }));
            if (this.isDev) {
                await this.restApi.put(Routes.applicationGuildCommands(this.config.bot.id || '', this.config.dev.guild || ''), {
                    body: commands
                });
                this.logger.debug(`Updated ${commands.length} dev guild slash commands 🔐`);
            } else {
                await this.restApi.put(Routes.applicationCommands(this.config.bot.id || ''), {
                    body: commands
                });
                this.logger.success(`Successfully registered ${commands.length} slash commands 🌐`);
            }
        } catch (error) {
            this.logger.error(`Failed to register ${Object.keys(this.slashCommands).length} slash commands.`);
            this.logger.error(error);        
        }
    }

    public embed({type, text}: BaseEmbedsOptions): EmbedBuilder {
        const color = colors[type];
        return new EmbedBuilder({
            title: `${emojis[type]} | ${type[0].toUpperCase()+type.slice(1)}!`,
            description: `> ${text}`
        }).setColor(color);
    }

    public async start(): Promise<void> {
        await this.mongo.init();
        await this._loadHandlers();
        await this.login(this.config.bot.token);
    }
}

export default Bot;