import XCTest

final class CuckooCueScreenshotTests: XCTestCase {
    func testTopLevelNavigationMatchesRunFirstStructure() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()

        XCTAssertEqual(app.tabBars.count, 0)
        XCTAssertTrue(app.navigationBars["Cuckoo Cue"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.images["brand-lockup"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["web-search-link"].exists)
        XCTAssertTrue(app.buttons["新しいリストを作る"].exists)
        XCTAssertTrue(app.staticTexts["ストア掲載文を確認する"].exists)

        app.buttons["Widget設定"].tap()
        XCTAssertTrue(app.navigationBars["ウィジェット"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.otherElements["widget-settings-preview"].exists)
        app.buttons["完了"].tap()
        XCTAssertTrue(app.navigationBars["Cuckoo Cue"].waitForExistence(timeout: 5))
    }

    func testEmptyRunStatePromotesWebSearchInContent() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "state-empty"]
        app.launch()

        XCTAssertTrue(app.staticTexts["リストを始めましょう"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["web-search-link"].exists)
        XCTAssertTrue(app.buttons["新しいリストを作る"].exists)
    }

    func testOnlyLatestCompletedRunIsFollowedByWebHistory() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "state-completed-run"]
        app.launch()

        XCTAssertTrue(app.staticTexts["最近完了"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["週末の用事"].exists)
        XCTAssertFalse(app.staticTexts["リリース準備"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["web-history-link"].exists)
    }

    func testCompletedRunCanBeRestoredOrReusedLocally() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "state-completed-run"]
        app.launch()

        app.staticTexts["週末の用事"].tap()
        XCTAssertTrue(app.buttons["植物に水をあげるの完了を取り消す"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["もう一度使う"].exists)
        app.buttons["もう一度使う"].tap()
        XCTAssertTrue(app.buttons["植物に水をあげるを完了"].waitForExistence(timeout: 5))
    }

    func testExistingTaskEditsInlineFromRunDetail() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()

        app.staticTexts["リリース準備"].tap()
        let editTask = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "ストア掲載文を確認するを編集")
        ).firstMatch
        XCTAssertTrue(editTask.waitForExistence(timeout: 5))
        editTask.tap()
        XCTAssertTrue(app.textFields["task-title-editor-demo-1"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars["項目を編集"].exists)
    }

    func testTaskMetadataExpandsInsideRunDetail() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()

        app.staticTexts["リリース準備"].tap()
        let details = app.buttons["ストア掲載文を確認するの日付と優先度を編集"]
        XCTAssertTrue(details.waitForExistence(timeout: 5))
        details.tap()
        XCTAssertTrue(app.otherElements["task-details-demo-1"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["開始日を設定"].exists)
        XCTAssertTrue(app.switches["期限を設定"].exists)
    }

    func testWidgetScreenshotHarnessIsAccessibleAtAllSizes() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--screenshot-gallery"]
        app.launch()

        let preview = app.otherElements["widget-preview"]
        XCTAssertTrue(preview.waitForExistence(timeout: 5))

        for label in ["Small", "Medium", "Large", "Lock"] {
            app.buttons[label].tap()
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "CuckooCue-Widget-\(label)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
}
