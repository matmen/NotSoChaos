const childProcess = require('child_process');
const GitHubAPI = require('github');

const gitConfig = require('./config.json');

class Updater {

	constructor() {
		this.github = new GitHubAPI();

		this.github.authenticate({
			type: 'token',
			token: process.env.githubToken
		});

		this.scheduler = this.createScheduler();
		this.update();
	}

	createScheduler() {
		return setInterval(this.update.bind(this), 60 * 1000);
	}

	async update() {
		console.log('[GIT] Checking for updates..');

		const pullRequests = await this.github.pullRequests.getAll({
			owner: gitConfig.owner,
			repo: gitConfig.repo
		});

		let changed = false;

		for (const pullRequest of pullRequests.data) {
			const reviews = await this.github.pullRequests.getReviews({
				owner: gitConfig.owner,
				repo: gitConfig.repo,
				number: pullRequest.number
			});

			const approved = reviews.data.filter(review => review.state === 'APPROVED').length;
			const unapproved = reviews.data.filter(review => review.state === 'REQUEST_CHANGES').length;

			if (this.shouldMerge(approved, unapproved)) {
				console.log(`[GIT] Merging "${pullRequest.title}" (${approved}/${unapproved})`);

				try {
					await this.github.pullRequests.merge({
						owner: gitConfig.owner,
						repo: gitConfig.repo,
						number: pullRequest.number,
						commit_title: `Auto-Merge: "${pullRequest.title}"`,
						commit_message: `Approval rate: ${approved}/${reviews.data.length} (${Math.round(approved / reviews.data.length * 10000) / 100}%)`,
						merge_method: 'squash'
					});

					await this.github.issues.createComment({
						owner: gitConfig.owner,
						repo: gitConfig.repo,
						number: pullRequest.number,
						body: `Merged.\nApproval rate: ${approved}/${reviews.data.length} (${Math.round(approved / reviews.data.length * 10000) / 100}%)`
					});

					changed = true;
				} catch (err) {
					console.log(`[GIT] Failed to merge "${pullRequest.title}" (${err})`);
				}

			} else if (this.isOutdated(Date.parse(pullRequest.created_at).valueOf())) {
				console.log(`[GIT] Closing "${pullRequest.title}" (${approved}/${unapproved})`);

				await this.github.issues.createComment({
					owner: gitConfig.owner,
					repo: gitConfig.repo,
					number: pullRequest.number,
					body: 'Not enough votes, closing'
				});

				await this.github.pullRequests.update({
					owner: gitConfig.owner,
					repo: gitConfig.repo,
					number: pullRequest.number,
					state: 'closed'
				});
			}
		}

		if (changed) {
			console.log('[GIT] Restarting to apply updates..');
			process.exit();
		} else console.log('[GIT] No updates found');
	}

	/*
	Checks if the PR should be merged

	Return true if there amount of approved reviews is more than double the amount of unapproved reviews
	and there are more than two approved reviews
	*/
	shouldMerge(approved, unapproved) {
		return approved > unapproved * 2 && approved > 2;
	}

	/*
	Checks if the PR is outdated

	Return true if PR is older than 3 days
	*/
	isOutdated(timeCreated) {
		return Date.now() - timeCreated > 3 * 24 * 60 * 60 * 1000;
	}

}

module.exports = new Updater();
