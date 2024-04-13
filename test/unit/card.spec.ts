import { masterDuelIllustration, masterDuelIllustrationURL, yugipediaFileRedirect } from "../../src/card";

describe("Helper functions", () => {
	test("yugipediaFileRedirect", () => {
		expect(yugipediaFileRedirect("BlazingCartesiatheVirtuous-MADU-JP-VG-artwork.png")).toEqual(
			"https://yugipedia.com/wiki/Special:Redirect/file/BlazingCartesiatheVirtuous-MADU-JP-VG-artwork.png?utm_source=bastion"
		);
	});
	test.each([
		{
			en: "Ghost Meets Girl - A Masterful Mayakashi Shiranui Saga",
			expected: "GhostMeetsGirlAMasterfulMayakashiShiranuiSaga-MADU-EN-VG-artwork.png"
		},
		{
			en: "Live☆Twin Ki-sikil",
			expected: "LiveTwinKisikil-MADU-EN-VG-artwork.png"
		},
		{
			en: "Evil★Twin Lil-la",
			expected: "EvilTwinLilla-MADU-EN-VG-artwork.png"
		},
		{
			en: "Number 81: Superdreadnought Rail Cannon Super Dora",
			expected: "Number81SuperdreadnoughtRailCannonSuperDora-MADU-EN-VG-artwork.png"
		},
		{
			en: "Danger!? Tsuchinoko",
			expected: "DangerTsuchinoko-MADU-EN-VG-artwork.png"
		}
	])("masterDuelIllustration returns $expected for: $en", ({ en, expected }) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mockCard = { name: { en } } as any;
		expect(masterDuelIllustration(mockCard)).toEqual(expected);
	});
	test("masterDuelIllustrationURL", () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mockCard = { name: { en: "Blue-Eyes White Dragon" } } as any;
		expect(masterDuelIllustrationURL(mockCard)).toEqual(
			"https://yugipedia.com/wiki/Special:Redirect/file/BlueEyesWhiteDragon-MADU-EN-VG-artwork.png?utm_source=bastion"
		);
	});
});
