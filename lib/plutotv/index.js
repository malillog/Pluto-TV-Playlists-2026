(function() {
	const fs = require('fs');
	const utils = require('#lib/utils.js');
	const api = require('./api');
	const ondemand = require('./ondemand');
	const OUTPUT_FILE_REGEX = /^plutotv_.*\.(cache|m3u8|xml)$/;

	const process = async (config) => {
		const regionalPlaylists = {};
		const regionalEpgs = {};

		const mapping = config.getMapping();
		const group = config.get('group');
		const regionalize = config.get('regionalize');
		const all = config.get('all');
		const outdir = config.get('outdir');
		const excludeGroups = config.get('excludeGroups');
		const excludeChannels = config.get('excludeChannels');
		const xTvgUrl = config.get('xTvgUrl');
		const vlcopts = config.get('vlcopts');
		const pipeopts = config.get('pipeopts');
		const includeMergedOutput = all && Object.keys(mapping).length > 1;

		const expectedOutputs = new Set();
		for (const region of Object.keys(mapping)) {
			expectedOutputs.add(`plutotv_${region}.m3u8`);
			expectedOutputs.add(`plutotv_${region}.xml`);
			if (config.get('ondemand')) {
				expectedOutputs.add(`plutotv_ondemand_${region}.cache`);
				expectedOutputs.add(`plutotv_ondemand_${region}.m3u8`);
				expectedOutputs.add(`plutotv_ondemand_${region}.xml`);
			}
		}
		if (includeMergedOutput) {
			expectedOutputs.add('plutotv_all.m3u8');
			expectedOutputs.add('plutotv_all.xml');
		}

		if (fs.existsSync(outdir)) {
			for (const entry of fs.readdirSync(outdir)) {
				if (!OUTPUT_FILE_REGEX.test(entry)) continue;
				if (expectedOutputs.has(entry)) continue;
				fs.rmSync(`${outdir}/${entry}`, { force: true });
			}
		}

		let chno = config.get('chno');
		if (chno !== false) chno = +chno;

		const getRegion = async (region) => {
			console.info("INFO: processing", region);
			try {
				const clientID = config.get('clientID');
				const xff = mapping[region];

				let fullTvgUrl = false;
				if (xTvgUrl) fullTvgUrl =xTvgUrl + (xTvgUrl.endsWith('/') ? `plutotv_${region}.xml` : '');

				console.log("getting boot data");
				const bootData = await api.boot(xff, clientID);
				console.log("getting channels");
				const channels = await api.channels(xff);
				console.log("getting categories");
				const categories = await api.categories(xff);
				console.log("getting timelines");
				const timelines = await api.timelines(xff);

				console.log("generating m3u8");
				const { m3u8, numChannels } = await api.generateM3U8(
					region,
					group,
					regionalize,
					excludeGroups,
					excludeChannels,
					chno,
					fullTvgUrl,
					vlcopts,
					xff,
					pipeopts
				);

				if (chno !== false) chno += numChannels;

				console.log("generating xmltv");
				const xmltv = await api.generateXMLTV(region, regionalize);
				fs.writeFileSync(`${outdir}/plutotv_${region}.m3u8`, m3u8, 'utf-8');
				fs.writeFileSync(`${outdir}/plutotv_${region}.xml`, xmltv, 'utf-8');

				regionalPlaylists[region] = m3u8;
				regionalEpgs[region] = xmltv;

				if (config.get('ondemand')) {
					await ondemand.onDemandCategories(config, region, bootData);

					console.log("generating ondemand m3u8");
					const res = await ondemand.generateM3U8(config, region, bootData);
					if (res?.m3u8) fs.writeFileSync(`${outdir}/plutotv_ondemand_${region}.m3u8`, res.m3u8, 'utf-8');
					const xmltv = await ondemand.generateXMLTV(config, region);
					if (xmltv) fs.writeFileSync(`${outdir}/plutotv_ondemand_${region}.xml`, xmltv, 'utf-8');
					console.log("completed");
				}
			} catch (ex) {
				console.error("ERROR: got exception", ex.message);
			}
		}

		for (const key of Object.keys(mapping)) await getRegion(key);

		if (includeMergedOutput) {
			let fullTvgUrl = false;
			if (xTvgUrl) fullTvgUrl = xTvgUrl + (xTvgUrl.endsWith('/') ? 'plutotv_all.xml' : '');
			const m3u8 = utils.mergeM3U8(regionalPlaylists, fullTvgUrl);
			const xmltv = utils.mergeXMLTV(regionalEpgs);
			fs.writeFileSync(`${outdir}/plutotv_all.m3u8`, m3u8, 'utf-8');
			fs.writeFileSync(`${outdir}/plutotv_all.xml`, xmltv, 'utf-8');
		}
	}

	exports = module.exports = {
		process
	}
})();
