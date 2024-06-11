import {
	ChatInputCommandInteraction,
	RESTPostAPIApplicationCommandsJSONBody,
	SlashCommandBuilder,
	SlashCommandStringOption
} from "discord.js";
import { Got } from "got";
import { inject, injectable } from "tsyringe";
import { c } from "ttag";
import { Command } from "../Command";
import { buildLocalisedChoice, buildLocalisedCommand } from "../locale";
import { Logger, getLogger } from "../logger";
import { Metrics } from "../metrics";
import { replyLatency } from "../utils";

export interface TopStrategiesResponse {
	archetypes: { arch_1: string; quantity: number; arch_1_img: number; archetypeTierPage: string }[];
	format: string;
	dateCutoffStart: string;
	dateCutoffEnd: string;
	tierMin: number;
	tierMax: number;
	total: number;
}

export type TopCardsFormat =
	| "Tournament Meta Decks"
	| "Tournament Meta Decks OCG"
	| "Tournament Meta Decks OCG (Asian-English)"
	| "Master Duel Decks";
// https://ygoprodeck.com/top/ uses 90 for 3 months, 182 for 6 months
export type TopCardsDateStart = "format" | "banlist" | `${number} day`;

export interface TopCardsResponse {
	keys: {
		format: string;
		dateStart: string;
		dateEnd: string;
	};
	results: {
		name: string;
		card_number: number;
		pretty_url: string;
		total_card_count: `${number}`;
		deck_count: number;
		avg_card_per_deck: `${number}`;
		percentage: `${number}`;
		percent_played_at_1: `${number}`;
		percent_played_at_2: `${number}`;
		percent_played_at_3: `${number}`;
	}[];
}

export interface MasterDuelCardUsage {
	name: string;
	id: number;
	win_count: number;
	loss_count: number;
	win_ratio: number;
	duel_count: number;
	placement: number;
	season: number;
	game_mode: string;
	pretty_url: string;
	rarity: string;
}

export interface MasterDuelTier {
	tier: number;
	season: number;
	game_mode: string;
	archetype_name: string;
	win_count: number;
	loss_count: number;
	win_ratio: string;
	duel_count: number;
	rank_weighted_score: number;
	average_turn_count: string;
	median_turn_count: string;
}

@injectable()
export class MetagameClient {
	constructor(@inject("got") private got: Got) {
		this.got = got.extend({ throwHttpErrors: true });
	}

	async getTops(region: string): Promise<TopStrategiesResponse> {
		return await this.got
			.post("https://ygoprodeck.com/api/tournament/getTopArchetypes.php", {
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded"
				},
				body: `format=${region}`
			})
			.json();
	}

	async getCardUsage(format: TopCardsFormat, dateStart: TopCardsDateStart): Promise<TopCardsResponse> {
		const url = new URL("https://ygoprodeck.com/api/top/getFormat.php");
		url.searchParams.set("format", format);
		url.searchParams.set("dateStart", dateStart);
		return await this.got(url).json();
	}

	async getMasterDuelCardUsage(): Promise<MasterDuelCardUsage[]> {
		return await this.got("https://ygoprodeck.com/api/master-duel/card-usage.php").json();
	}

	async getMasterDuelTierList(): Promise<MasterDuelTier[]> {
		return await this.got("https://ygoprodeck.com/api/master-duel/tier-list.php").json();
	}
}

@injectable()
export class MetagameCommand extends Command {
	#logger = getLogger("command:metagame");

	constructor(
		metrics: Metrics,
		private api: MetagameClient
	) {
		super(metrics);
	}

	static override get meta(): RESTPostAPIApplicationCommandsJSONBody {
		const builder = buildLocalisedCommand(
			new SlashCommandBuilder(),
			() => c("command-name").t`metagame`,
			() =>
				c("command-description")
					.t`Show the current competitive strategies in tournaments and the Master Duel ranked ladder.`
		);
		const option = buildLocalisedCommand(
			new SlashCommandStringOption()
				.addChoices([
					buildLocalisedChoice("TCG", () => "TCG"),
					buildLocalisedChoice("OCG", () => "OCG"),
					buildLocalisedChoice("OCG-AE", () => "OCG (Asian-English)"),
					buildLocalisedChoice("MD-CU", () => "Master Duel Diamond+ ranked card usage"),
					buildLocalisedChoice("MD-TL", () => "Master Duel Diamond+ tier list")
				])
				.setRequired(true),
			() => c("command-option").t`region`,
			() => c("command-option-description").t`Game region.`
		);
		return builder.addStringOption(option).toJSON();
	}
	protected override get logger(): Logger {
		return this.#logger;
	}

	private async masterDuelCardUsage(interaction: ChatInputCommandInteraction): Promise<number> {
		const usage = await this.api.getMasterDuelCardUsage();
		const reply = await interaction.reply({
			embeds: [
				{
					title: "Master Duel Diamond+ ranked card usage",
					url: "https://ygoprodeck.com/master-duel/card-usage/?utm_source=bastion",
					fields: usage.map(card => ({
						name: card.name,
						value: `${(card.win_ratio * 100).toFixed(2)}% wins in ${card.duel_count} duels`
					})),
					footer: { text: `YGOPRODECK data for season ${usage[0].season}` }
				}
			],
			fetchReply: true
		});
		return replyLatency(reply, interaction);
	}

	private async masterDuelTierList(interaction: ChatInputCommandInteraction): Promise<number> {
		const tierList = await this.api.getMasterDuelTierList();
		const tiers = new Map<number, MasterDuelTier[]>();
		for (const strategy of tierList) {
			if (!tiers.has(strategy.tier)) {
				tiers.set(strategy.tier, []);
			}
			tiers.get(strategy.tier)!.push(strategy);
		}
		const reply = await interaction.reply({
			embeds: [
				{
					title: "Master Duel Diamond+ tier list",
					url: "https://ygoprodeck.com/master-duel/tier-list/?utm_source=bastion",
					fields: [...tiers.entries()].map(([tier, strategies]) => ({
						name: `Tier ${tier}`,
						value: strategies
							.map(
								strategy =>
									`- ${strategy.archetype_name} WR: ${strategy.win_ratio} (WS: ${strategy.rank_weighted_score})\n`
							)
							.join("")
					})),
					footer: {
						text: `YGOPRODECK weighted scores for season ${tierList[0].season}.\nMean turns: ${tierList[0].average_turn_count}. Median turns: ${tierList[0].median_turn_count}`
					}
				}
			],
			fetchReply: true
		});
		return replyLatency(reply, interaction);
	}

	private link(path: string): URL {
		const url = new URL(`https://ygoprodeck.com${path}`);
		url.searchParams.set("utm_source", "bastion");
		return url;
	}

	private async tournamentTops(interaction: ChatInputCommandInteraction, region: string): Promise<number> {
		const tops = await this.api.getTops(region);
		let description = "";
		let otherQuantity = 0;
		for (const strategy of tops.archetypes) {
			if (strategy.quantity * 32 < tops.total) {
				otherQuantity += strategy.quantity;
			} else {
				description += `${((strategy.quantity / tops.total) * 100).toFixed(2)}% [${strategy.arch_1}](${this.link(strategy.archetypeTierPage)})\n`;
			}
		}
		description += `${((otherQuantity / tops.total) * 100).toFixed(2)}% Other`;
		const reply = await interaction.reply({
			embeds: [
				{
					title: `Top ${tops.format} strategies`,
					description,
					url: `https://ygoprodeck.com/tournaments/top-archetypes/?utm_source=bastion#${region}/All/Format/NA/`,
					footer: { text: `YGOPRODECK data ${tops.dateCutoffStart} to ${tops.dateCutoffEnd}` },
					image: {
						url: `https://dawnbrandbots.github.io/ygoprodeck-e2e-test/top-chart-${region.toLowerCase()}.png`
					}
				}
			],
			fetchReply: true
		});
		return replyLatency(reply, interaction);
	}

	protected override async execute(interaction: ChatInputCommandInteraction): Promise<number> {
		const region = interaction.options.getString("region", true);
		switch (region) {
			case "MD-CU":
				return await this.masterDuelCardUsage(interaction);
			case "MD-TL":
				return await this.masterDuelTierList(interaction);
			default:
				return await this.tournamentTops(interaction, region);
		}
	}
}
